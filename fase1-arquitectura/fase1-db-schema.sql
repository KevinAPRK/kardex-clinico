-- ============================================================
-- FASE 1 — SCHEMA COMPLETO Kardex Clínico
-- Ejecutar primero en Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TYPE user_role AS ENUM ('admin', 'pharmacist', 'nurse', 'auditor');
CREATE TYPE material_unit AS ENUM ('unit','box','blister','vial','ampoule','ml','mg','g','l','tablet','capsule');
CREATE TYPE movement_type AS ENUM ('entry','exit','adjustment','transfer','return','loss');
CREATE TYPE movement_status AS ENUM ('pending','confirmed','cancelled');

-- PROFILES
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  license_number TEXT,
  department TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE profile_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, role)
);
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, 'Usuario nuevo')
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ENVIRONMENTS
CREATE TABLE environments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SUPPLIERS
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  ruc TEXT UNIQUE,
  contact_name TEXT, phone TEXT, email TEXT, address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MATERIALS
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT, category TEXT,
  unit TEXT NOT NULL,
  requires_expiry BOOLEAN NOT NULL DEFAULT TRUE,
  min_stock INTEGER NOT NULL DEFAULT 0,
  default_supplier_id UUID REFERENCES suppliers(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT materials_min_stock_check CHECK (min_stock >= 0)
);
CREATE INDEX idx_materials_code ON materials USING btree(code);
CREATE INDEX idx_materials_name ON materials USING gin(name gin_trgm_ops);

-- LOTS
CREATE TABLE lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  material_id UUID NOT NULL REFERENCES materials(id),
  supplier_id UUID REFERENCES suppliers(id),
  lot_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  manufacture_date DATE,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  initial_qty NUMERIC(10,2) NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (material_id, lot_number),
  CONSTRAINT lots_initial_qty_pos CHECK (initial_qty > 0)
);
CREATE OR REPLACE FUNCTION validate_lot_material() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN IF NOT (SELECT requires_expiry FROM materials WHERE id = NEW.material_id) THEN
  RAISE EXCEPTION 'El material % no requiere vencimiento y no puede tener lotes.', NEW.material_id; END IF; RETURN NEW; END;$$;
CREATE TRIGGER check_lot_material_requires_expiry BEFORE INSERT OR UPDATE ON lots FOR EACH ROW EXECUTE FUNCTION validate_lot_material();
CREATE INDEX idx_lots_material ON lots(material_id);
CREATE INDEX idx_lots_expiry ON lots(expiry_date);

-- MOVEMENTS
CREATE TABLE movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  material_id UUID NOT NULL REFERENCES materials(id),
  lot_id UUID REFERENCES lots(id),
  environment_id UUID REFERENCES environments(id),
  type movement_type NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit_cost NUMERIC(12,4),
  reference TEXT, notes TEXT,
  status movement_status NOT NULL DEFAULT 'confirmed',
  performed_by UUID NOT NULL REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT movement_exit_needs_env CHECK (type NOT IN ('exit','transfer') OR environment_id IS NOT NULL),
  CONSTRAINT movement_qty_positive CHECK (quantity > 0)
);
CREATE OR REPLACE FUNCTION prevent_movement_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN IF OLD.status = 'confirmed' THEN RAISE EXCEPTION 'Los movimientos confirmados son inmutables.'; END IF; RETURN NEW; END;$$;
CREATE TRIGGER lock_confirmed_movements BEFORE UPDATE OR DELETE ON movements FOR EACH ROW EXECUTE FUNCTION prevent_movement_mutation();
CREATE INDEX idx_movements_material ON movements(material_id);
CREATE INDEX idx_movements_lot ON movements(lot_id);
CREATE INDEX idx_movements_performed_at ON movements(performed_at DESC);
CREATE INDEX idx_movements_type_status ON movements(material_id, type, status) WHERE status = 'confirmed';

-- VIEWS
CREATE OR REPLACE VIEW stock_by_lot AS
SELECT m.material_id, m.lot_id, mat.name AS material_name, mat.code AS material_code, mat.unit,
  l.lot_number, l.expiry_date, l.supplier_id,
  SUM(CASE WHEN m.type IN ('entry','return') AND m.status='confirmed' THEN m.quantity
           WHEN m.type IN ('exit','transfer','loss') AND m.status='confirmed' THEN -m.quantity
           WHEN m.type='adjustment' AND m.status='confirmed' THEN m.quantity ELSE 0 END) AS available_qty
FROM movements m JOIN materials mat ON mat.id=m.material_id LEFT JOIN lots l ON l.id=m.lot_id
WHERE m.status='confirmed' GROUP BY m.material_id, m.lot_id, mat.name, mat.code, mat.unit, l.lot_number, l.expiry_date, l.supplier_id;

CREATE OR REPLACE VIEW stock_by_material AS
SELECT material_id, material_name, material_code, unit, SUM(available_qty) AS total_qty
FROM stock_by_lot GROUP BY material_id, material_name, material_code, unit;

CREATE OR REPLACE VIEW fefo_queue AS
SELECT material_id, lot_id, lot_number, expiry_date, available_qty, material_name, unit,
  ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY expiry_date ASC, lot_id ASC) AS fefo_priority
FROM stock_by_lot WHERE available_qty > 0 AND lot_id IS NOT NULL;

CREATE OR REPLACE VIEW stock_alerts AS
SELECT sbm.material_id, sbm.material_name, sbm.material_code, sbm.unit, sbm.total_qty, mat.min_stock,
  CASE WHEN sbm.total_qty <= mat.min_stock THEN TRUE ELSE FALSE END AS low_stock,
  MIN(sbl.expiry_date) AS nearest_expiry,
  CASE WHEN MIN(sbl.expiry_date) <= CURRENT_DATE + 30 THEN TRUE ELSE FALSE END AS expiring_soon
FROM stock_by_material sbm JOIN materials mat ON mat.id=sbm.material_id
LEFT JOIN stock_by_lot sbl ON sbl.material_id=sbm.material_id
GROUP BY sbm.material_id, sbm.material_name, sbm.material_code, sbm.unit, sbm.total_qty, mat.min_stock;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION auth_has_role(required_role user_role) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM profile_roles WHERE profile_id=auth.uid() AND role=required_role); END;$$;
CREATE OR REPLACE FUNCTION auth_has_any_role(required_roles user_role[]) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM profile_roles WHERE profile_id=auth.uid() AND role=ANY(required_roles)); END;$$;

CREATE POLICY "profiles: self read" ON profiles FOR SELECT USING (id=auth.uid());
CREATE POLICY "profiles: admin read all" ON profiles FOR SELECT USING (auth_has_role('admin'));
CREATE POLICY "profiles: self update" ON profiles FOR UPDATE USING (id=auth.uid());
CREATE POLICY "profile_roles: admin manage" ON profile_roles FOR ALL USING (auth_has_role('admin'));
CREATE POLICY "profile_roles: self read" ON profile_roles FOR SELECT USING (profile_id=auth.uid());
CREATE POLICY "materials: authenticated read" ON materials FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "materials: admin pharmacist write" ON materials FOR INSERT WITH CHECK (auth_has_any_role(ARRAY['admin','pharmacist']::user_role[]));
CREATE POLICY "materials: admin pharmacist update" ON materials FOR UPDATE USING (auth_has_any_role(ARRAY['admin','pharmacist']::user_role[]));
CREATE POLICY "suppliers: authenticated read" ON suppliers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "suppliers: admin pharmacist write" ON suppliers FOR ALL USING (auth_has_any_role(ARRAY['admin','pharmacist']::user_role[]));
CREATE POLICY "lots: authenticated read" ON lots FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lots: pharmacist admin create" ON lots FOR INSERT WITH CHECK (auth_has_any_role(ARRAY['admin','pharmacist']::user_role[]));
CREATE POLICY "environments: authenticated read" ON environments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "environments: admin write" ON environments FOR ALL USING (auth_has_role('admin'));
CREATE POLICY "movements: authenticated read" ON movements FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "movements: pharmacist admin insert" ON movements FOR INSERT WITH CHECK (auth_has_any_role(ARRAY['admin','pharmacist']::user_role[]) AND performed_by=auth.uid());
CREATE POLICY "movements: cancel own pending" ON movements FOR UPDATE USING (status='pending' AND (performed_by=auth.uid() OR auth_has_role('admin')));

ALTER PUBLICATION supabase_realtime ADD TABLE movements;
ALTER PUBLICATION supabase_realtime ADD TABLE lots;
