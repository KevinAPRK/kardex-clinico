-- ============================================================
-- FASE 2: SQL COMPLEMENTARIO
-- Ajustes y adiciones a la DB de FASE 1
-- ============================================================

-- ── Categorías de productos ────────────────────────────────
CREATE TABLE IF NOT EXISTS material_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE material_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_categories: authenticated read" ON material_categories;
CREATE POLICY "material_categories: authenticated read"
  ON material_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "material_categories: admin write" ON material_categories;
CREATE POLICY "material_categories: admin write"
  ON material_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profile_roles
      WHERE profile_id = auth.uid() AND role = 'admin'
    )
  );

INSERT INTO material_categories (name)
VALUES
  ('Medicamento'),
  ('Insumo médico'),
  ('Reactivo'),
  ('Material quirúrgico'),
  ('Equipamiento'),
  ('Otro')
ON CONFLICT (name) DO NOTHING;

-- ── Unidades de medida ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE material_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_units: authenticated read" ON material_units;
CREATE POLICY "material_units: authenticated read"
  ON material_units FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "material_units: admin write" ON material_units;
CREATE POLICY "material_units: admin write"
  ON material_units FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profile_roles
      WHERE profile_id = auth.uid() AND role = 'admin'
    )
  );

INSERT INTO material_units (name)
VALUES
  ('Unidad'),
  ('Caja'),
  ('Blíster'),
  ('Vial'),
  ('Ampolla'),
  ('mL'),
  ('mg'),
  ('g'),
  ('L'),
  ('Tableta'),
  ('Cápsula')
ON CONFLICT (name) DO NOTHING;

DROP VIEW IF EXISTS stock_alerts;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'unit'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE materials
      ALTER COLUMN unit TYPE TEXT USING unit::text;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'materials'
      AND column_name = 'min_stock'
      AND data_type <> 'integer'
  ) THEN
    ALTER TABLE materials
      ALTER COLUMN min_stock TYPE INTEGER USING ROUND(min_stock)::integer;
  END IF;
END
$$;

UPDATE materials SET requires_expiry = FALSE;

-- ── Agregar columna unit a stock_alerts (faltaba en FASE 1) ─
-- La vista stock_by_lot ya tiene unit; stock_alerts la hereda via join
CREATE OR REPLACE VIEW stock_alerts AS
SELECT
  sbm.material_id,
  sbm.material_name,
  sbm.material_code,
  sbm.unit,
  sbm.total_qty,
  mat.min_stock,
  CASE WHEN sbm.total_qty <= mat.min_stock THEN TRUE ELSE FALSE END AS low_stock,
  MIN(sbl.expiry_date)                                              AS nearest_expiry,
  CASE WHEN MIN(sbl.expiry_date) <= CURRENT_DATE + 30 THEN TRUE ELSE FALSE END AS expiring_soon
FROM stock_by_material sbm
JOIN materials mat ON mat.id = sbm.material_id
LEFT JOIN stock_by_lot sbl ON sbl.material_id = sbm.material_id
GROUP BY sbm.material_id, sbm.material_name, sbm.material_code,
         sbm.unit, sbm.total_qty, mat.min_stock;


-- ── Habilitar Realtime en movements para alertas live ───────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'movements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE movements;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lots;
  END IF;
END
$$;


-- ── Función: calcular saldo acumulado para Kardex ───────────
-- Útil para Server Action que construye el Kardex con saldo corrido
CREATE OR REPLACE FUNCTION get_kardex(
  p_material_id UUID,
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  movement_id   UUID,
  performed_at  TIMESTAMPTZ,
  type          TEXT,
  lot_number    TEXT,
  expiry_date   DATE,
  environment   TEXT,
  performed_by  TEXT,
  reference     TEXT,
  quantity_in   NUMERIC,
  quantity_out  NUMERIC,
  running_total NUMERIC
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      m.id,
      m.performed_at,
      m.type::TEXT,
      l.lot_number,
      l.expiry_date,
      e.name AS environment,
      p.full_name AS performed_by,
      m.reference,
      CASE WHEN m.type IN ('entry', 'adjustment', 'return') THEN m.quantity ELSE 0 END AS qty_in,
      CASE WHEN m.type IN ('exit', 'loss', 'transfer')       THEN m.quantity ELSE 0 END AS qty_out
    FROM movements m
    LEFT JOIN lots         l ON l.id = m.lot_id
    LEFT JOIN environments e ON e.id = m.environment_id
    LEFT JOIN profiles     p ON p.id = m.performed_by
    WHERE m.material_id = p_material_id
      AND m.status = 'confirmed'
      AND (p_from IS NULL OR m.performed_at >= p_from)
      AND (p_to   IS NULL OR m.performed_at <= p_to)
    ORDER BY m.performed_at ASC
  )
  SELECT
    b.id,
    b.performed_at,
    b.type,
    b.lot_number,
    b.expiry_date,
    b.environment,
    b.performed_by,
    b.reference,
    b.qty_in,
    b.qty_out,
    SUM(b.qty_in - b.qty_out) OVER (ORDER BY b.performed_at ROWS UNBOUNDED PRECEDING) AS running_total
  FROM base b;
END;
$$;


-- ── Índice adicional para mejorar rendimiento de FEFO scan ──
CREATE INDEX IF NOT EXISTS idx_movements_type_status
  ON movements (material_id, type, status)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_lots_expiry_material
  ON lots (expiry_date ASC, material_id);


-- ── Tabla de log de emails (auditoría, opcional) ─────────────
CREATE TABLE IF NOT EXISTS email_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template      TEXT NOT NULL,
  recipient     TEXT NOT NULL,
  material_id   UUID REFERENCES materials(id),
  lot_id        UUID REFERENCES lots(id),
  movement_id   UUID REFERENCES movements(id),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success       BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT
);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_log: admin read" ON email_log;
CREATE POLICY "email_log: admin read"
  ON email_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profile_roles
      WHERE profile_id = auth.uid() AND role = 'admin'
    )
  );

-- Solo service_role puede insertar (desde Edge Functions)
-- No se añade policy INSERT para roles normales.
