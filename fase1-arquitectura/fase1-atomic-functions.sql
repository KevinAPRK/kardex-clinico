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
  v_requires    BOOLEAN;
  v_timestamp   TIMESTAMPTZ := COALESCE(p_performed_at, NOW());
BEGIN
  -- Advisory lock: serializa operaciones sobre el mismo material.
  -- Se libera automáticamente al final de la transacción.
  PERFORM pg_advisory_xact_lock(material_lock_key(p_material_id));

  -- Verificar que el material existe y está activo
  SELECT requires_expiry INTO v_requires
  FROM materials
  WHERE id = p_material_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATERIAL_NOT_FOUND: %', p_material_id;
  END IF;

  -- ── Resolver lote ──────────────────────────────────────
  IF v_requires THEN
    IF p_lot_number IS NULL OR p_expiry_date IS NULL THEN
      RAISE EXCEPTION 'LOT_REQUIRED: El material requiere número de lote y fecha de vencimiento';
    END IF;

    -- Buscar lote existente (mismo material + número de lote)
    SELECT id INTO v_lot_id
    FROM lots
    WHERE material_id = p_material_id AND lot_number = p_lot_number;

    -- Si no existe, crear
    IF v_lot_id IS NULL THEN
      INSERT INTO lots (
        material_id, supplier_id, lot_number, expiry_date,
        manufacture_date, received_date, initial_qty, created_by
      ) VALUES (
        p_material_id, p_supplier_id, p_lot_number, p_expiry_date,
        p_manufacture_date, CURRENT_DATE, p_quantity, p_performed_by
      )
      RETURNING id INTO v_lot_id;
    END IF;
  END IF;

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
  v_requires       BOOLEAN;
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
  SELECT requires_expiry INTO v_requires
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

  -- ══════════════════════════════════════════════════════
  -- RAMA A: Material CON vencimiento — FEFO multi-lote
  -- Lee fefo_queue DENTRO de la transacción con lock activo.
  -- Ninguna otra TX puede modificar este material hasta que
  -- esta TX termine (COMMIT o ROLLBACK).
  -- ══════════════════════════════════════════════════════
  IF v_requires THEN

    FOR v_lot IN
      SELECT lot_id, lot_number, expiry_date, available_qty
      FROM fefo_queue
      WHERE material_id = p_material_id
        AND available_qty > 0
      ORDER BY fefo_priority ASC          -- expiry_date ASC, lot_id ASC
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_take := LEAST(v_lot.available_qty, v_remaining);

      INSERT INTO movements (
        material_id, lot_id, environment_id, type, quantity,
        unit_cost, reference, notes, status, performed_by, performed_at
      ) VALUES (
        p_material_id, v_lot.lot_id, p_environment_id, 'exit', v_take,
        p_unit_cost, p_reference, p_notes, 'confirmed', p_performed_by, v_timestamp
      )
      RETURNING id INTO v_movement_id;

      v_result.movement_id  := v_movement_id;
      v_result.lot_id       := v_lot.lot_id;
      v_result.lot_number   := v_lot.lot_number;
      v_result.expiry_date  := v_lot.expiry_date;
      v_result.allocate_qty := v_take;
      RETURN NEXT v_result;

      v_remaining := v_remaining - v_take;
    END LOOP;

    -- Verificación final: ¿se cubrió la cantidad total?
    -- (puede diferir del stock check inicial si hay datos corruptos)
    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'FEFO_INCOMPLETE: Solo se asignaron % de % solicitadas',
        (p_quantity - v_remaining), p_quantity;
    END IF;

  -- ══════════════════════════════════════════════════════
  -- RAMA B: Material SIN vencimiento — movimiento directo
  -- ══════════════════════════════════════════════════════
  ELSE
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
  END IF;

END;
$$;


-- ============================================================
-- process_adjustment_atomic
-- Ajuste +/- con lock por material.
-- ============================================================
CREATE OR REPLACE FUNCTION process_adjustment_atomic(
  p_material_id  UUID,
  p_lot_id       UUID,
  p_quantity     NUMERIC,
  p_sign         TEXT,       -- 'positive' | 'negative'
  p_reference    TEXT DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL,
  p_performed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(movement_id UUID, movement_type TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_movement_id  UUID;
  v_type         TEXT;
  v_requires     BOOLEAN;
  v_stock        NUMERIC;
  v_timestamp    TIMESTAMPTZ := COALESCE(p_performed_at, NOW());
BEGIN
  PERFORM pg_advisory_xact_lock(material_lock_key(p_material_id));

  SELECT requires_expiry INTO v_requires
  FROM materials WHERE id = p_material_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATERIAL_NOT_FOUND: %', p_material_id;
  END IF;

  IF v_requires AND p_lot_id IS NULL THEN
    RAISE EXCEPTION 'LOT_REQUIRED: Este material requiere lot_id para ajustes';
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
    p_material_id, p_lot_id, NULL, v_type::movement_type, p_quantity,
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
REVOKE ALL ON FUNCTION process_entry_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION process_exit_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION process_adjustment_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_entry_atomic TO service_role;
GRANT EXECUTE ON FUNCTION process_exit_atomic TO service_role;
GRANT EXECUTE ON FUNCTION process_adjustment_atomic TO service_role;
