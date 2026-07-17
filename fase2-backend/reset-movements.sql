-- ============================================================
-- RESET DE MOVIMIENTOS
-- Ejecutar manualmente en Supabase SQL Editor.
-- Elimina todos los movimientos y el log de emails asociado.
-- Afecta stock calculado porque stock_by_lot/stock_by_material dependen de movements.
-- ============================================================

BEGIN;

ALTER TABLE movements DISABLE TRIGGER lock_confirmed_movements;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'email_log'
  ) THEN
    EXECUTE 'DELETE FROM email_log';
  END IF;
END $$;

DELETE FROM movements;

ALTER TABLE movements ENABLE TRIGGER lock_confirmed_movements;

COMMIT;