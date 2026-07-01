# FASE 3 — Frontend Next.js App Router

## Setup
```bash
npm install
cp .env.example .env.local
# Editar .env.local con keys de Supabase
npm run dev
# → http://localhost:3000
```

## Variables requeridas (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Páginas
| Ruta | Descripción |
|------|-------------|
| /auth/login | Login Supabase Auth (split-screen) |
| /dashboard | KPIs + alertas stock + últimos movimientos |
| /materiales | CRUD + toggle requires_expiry |
| /movimientos | Entrada / Salida FEFO / Ajuste + historial |
| /lotes | READ ONLY — FEFO order + badges vencimiento |
| /kardex | Saldo corrido via get_kardex() |
| /proveedores | CRUD tarjetas |
| /reportes | Filtros + export PDF + Excel (SheetJS) |

## Regla fundamental
CERO lógica de negocio en frontend.
Todo cálculo, FEFO, stock → backend (Fase 1 + Fase 2).
