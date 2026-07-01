# FASE 1 — Arquitectura y Base de Datos

## Archivos SQL (ejecutar en orden en Supabase SQL Editor)
1. `fase1-db-schema.sql` — Tablas, triggers, vistas calculadas, RLS
2. `fase1-atomic-functions.sql` — Funciones PG atómicas con advisory locks
3. `fase1-db-additions.sql` — Vista corregida, índices, función get_kardex(), email_log

## Vistas calculadas (stock nunca es columna)
- `stock_by_material` — stock total por material
- `stock_by_lot` — stock desglosado por lote
- `fefo_queue` — cola FEFO ordenada por expiry_date ASC + ROW_NUMBER()
- `stock_alerts` — materiales bajo mínimo o próximos a vencer (30d)

## Funciones PG (SECURITY DEFINER)
- `process_entry_atomic()` — lote + movimiento en 1 TX + advisory lock
- `process_exit_atomic()` — FEFO multi-lote en 1 TX + advisory lock
- `process_adjustment_atomic()` — ajuste con lock por material
- `get_kardex()` — saldo corrido con SUM() OVER UNBOUNDED PRECEDING

## Reglas críticas
- Stock NUNCA se almacena — siempre calculado en vistas
- Movimientos son INMUTABLES una vez confirmados
- FEFO OBLIGATORIO para materiales con requires_expiry=true
- Concurrencia gestionada con pg_advisory_xact_lock por material
