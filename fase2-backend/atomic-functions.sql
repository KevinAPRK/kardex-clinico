-- ============================================================
-- FASE 2 — FUNCIONES ATÓMICAS PostgreSQL
-- Toda la lógica crítica vive aquí, no en la Edge Function.
-- Garantías: transacción única, advisory lock por material,
-- rollback automático si cualquier paso falla.
-- ============================================================

-- ── HELPER: hash numérico para advisory lock por material ───
-- pg_advisory_xact_lock acepta bigint; convertimos UUID a bigint
-- via hashtext para que cada material tenga su propio lock slot.
CREATE OR REPLACE FUNCTION material_lock_key(p_material_id UUID)
RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$
  SELECT ('x' || substr(replace(p_material_id::text, '-', ''), 1, 16))::bit(64)::bigint;
$$;


-- ============================================================
-- process_entry_atomic
-- Crea lote si aplica + inserta movimiento entry en 1 TX.
-- Devuelve movement_id y lot_id resultante.
-- ============================================================
CREATE OR REPLACE FUNCTION process_entry_atomic(
  p_material_id     UUID,
  p_quantity        NUMERIC,
  p_unit_cost       NUMERIC        DEFAULT NULL,
  p_reference       TEXT           DEFAULT NULL,
  p_notes           TEXT           DEFAULT NULL,
  p_environment_id  UUID           DEFAULT NULL,
  p_performed_by    UUID           DEFAULT NULL,
  p_performed_at    TIMESTAMPTZ    DEFAULT NULL,
  -- Datos de lote (NULL si material no requiere vencimiento)
  p_lot_number      TEXT           DEFAULT NULL,
  p_expiry_date     DATE           DEFAULT NULL,
  p_manufacture_date DATE          DEFAULT NULL,
  p_supplier_id     UUID           DEFAULT NULL
)
RETURNS TABLE(movement_id UUID, lot_id UUID)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lot_id      UUID;
  v_movement_id UUID;
  v_timestamp   TIMESTAMPTZ := COALESCE(p_performed_at, NOW());
BEGIN
  -- Advisory lock: serializa operaciones sobre el mismo material.
  -- Se libera automáticamente al final de la transacción.
  PERFORM pg_advisory_xact_lock(material_lock_key(p_material_id));

  -- Verificar que el material existe y está activo
  PERFORM 1
  FROM materials
  WHERE id = p_material_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATERIAL_NOT_FOUND: %', p_material_id;
  END IF;

  -- Lotes y vencimiento desactivados temporalmente
  v_lot_id := NULL;

  -- ── Insertar movimiento ────────────────────────────────
  INSERT INTO movements (
    material_id, lot_id, environment_id, type, quantity,
    unit_cost, reference, notes, status, performed_by, performed_at
  ) VALUES (
    p_material_id, v_lot_id, p_environment_id, 'entry', p_quantity,
    p_unit_cost, p_reference, p_notes, 'confirmed', p_performed_by, v_timestamp
  )
  RETURNING id INTO v_movement_id;

  RETURN QUERY SELECT v_movement_id, v_lot_id;
END;
$$;


-- ============================================================
-- process_exit_atomic
-- FEFO multi-lote completo + inserción atómica de movimientos.
-- Devuelve SETOF rows: una por cada lote consumido.
-- ============================================================
DROP FUNCTION IF EXISTS process_exit_atomic(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS process_exit_atomic(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ);
DROP TYPE IF EXISTS exit_allocation CASCADE;
CREATE TYPE exit_allocation AS (
  movement_id  UUID,
  lot_id       UUID,
  lot_number   TEXT,
  expiry_date  DATE,
  allocate_qty NUMERIC
);

CREATE OR REPLACE FUNCTION process_exit_atomic(
  p_material_id    UUID,
  p_quantity       NUMERIC,
  p_environment_id UUID,
  p_performed_by   UUID,
  p_reference      TEXT    DEFAULT NULL,
  p_notes          TEXT    DEFAULT NULL,
  p_unit_cost      NUMERIC DEFAULT NULL,
  p_performed_at   TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF exit_allocation
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_stock  NUMERIC;
  v_remaining      NUMERIC := p_quantity;
  v_take           NUMERIC;
  v_movement_id    UUID;
  v_timestamp      TIMESTAMPTZ := COALESCE(p_performed_at, NOW());
  v_lot            RECORD;
  v_result         exit_allocation;
BEGIN
  -- Advisory lock: serializa todas las salidas del mismo material.
  -- Garantiza que dos salidas concurrentes no lean el mismo stock.
  PERFORM pg_advisory_xact_lock(material_lock_key(p_material_id));

  -- Validar material
  PERFORM 1
  FROM materials
  WHERE id = p_material_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATERIAL_NOT_FOUND: %', p_material_id;
  END IF;

  -- Validar entorno
  IF NOT EXISTS (SELECT 1 FROM environments WHERE id = p_environment_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'ENV_NOT_FOUND: Entorno no encontrado o inactivo';
  END IF;

  -- ── Stock total actual (post-lock, lectura segura) ─────
  SELECT COALESCE(total_qty, 0) INTO v_current_stock
  FROM stock_by_material
  WHERE material_id = p_material_id;

  IF v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Disponible=%, requerido=%',
      v_current_stock, p_quantity;
  END IF;

  -- Modo temporal sin FEFO ni lotes
  INSERT INTO movements (
    material_id, lot_id, environment_id, type, quantity,
    unit_cost, reference, notes, status, performed_by, performed_at
  ) VALUES (
    p_material_id, NULL, p_environment_id, 'exit', p_quantity,
    p_unit_cost, p_reference, p_notes, 'confirmed', p_performed_by, v_timestamp
  )
  RETURNING id INTO v_movement_id;

  v_result.movement_id  := v_movement_id;
  v_result.lot_id       := NULL;
  v_result.lot_number   := NULL;
  v_result.expiry_date  := NULL;
  v_result.allocate_qty := p_quantity;
  RETURN NEXT v_result;

END;
$$;


-- ============================================================
-- process_adjustment_atomic
-- Ajuste +/- con lock por material.
-- ============================================================
DROP FUNCTION IF EXISTS process_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS process_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION process_adjustment_atomic(
  p_material_id  UUID,
  p_lot_id       UUID,
  p_quantity     NUMERIC,
  p_sign         TEXT,       -- 'positive' | 'negative'
  p_reference    TEXT DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL,
  p_performed_at TIMESTAMPTZ DEFAULT NULL,
  p_environment_id UUID DEFAULT NULL
)
RETURNS TABLE(movement_id UUID, movement_type TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_movement_id  UUID;
  v_type         TEXT;
  v_stock        NUMERIC;
  v_timestamp    TIMESTAMPTZ := COALESCE(p_performed_at, NOW());
BEGIN
  PERFORM pg_advisory_xact_lock(material_lock_key(p_material_id));

  PERFORM 1 FROM materials WHERE id = p_material_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATERIAL_NOT_FOUND: %', p_material_id;
  END IF;

  IF p_sign = 'negative' THEN
    SELECT COALESCE(total_qty, 0) INTO v_stock
    FROM stock_by_material WHERE material_id = p_material_id;
    IF v_stock < p_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Disponible=%, ajuste=%', v_stock, p_quantity;
    END IF;
    v_type := 'loss';
  ELSE
    v_type := 'adjustment';
  END IF;

  INSERT INTO movements (
    material_id, lot_id, environment_id, type, quantity,
    unit_cost, reference, notes, status, performed_by, performed_at
  ) VALUES (
    p_material_id, p_lot_id, p_environment_id, v_type::movement_type, p_quantity,
    NULL, p_reference,
    '[AJUSTE ' || upper(p_sign) || '] ' || p_notes,
    'confirmed', p_performed_by, v_timestamp
  )
  RETURNING id INTO v_movement_id;

  RETURN QUERY SELECT v_movement_id, v_type;
END;
$$;


-- ============================================================
-- PERMISOS: solo service_role puede ejecutar estas funciones
-- (las Edge Functions usan service_role key)
-- ============================================================
REVOKE ALL ON FUNCTION process_entry_atomic(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, DATE, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION process_exit_atomic(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION process_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_entry_atomic(UUID, NUMERIC, NUMERIC, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, DATE, DATE, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION process_exit_atomic(UUID, NUMERIC, UUID, UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION process_adjustment_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID) TO service_role;
