# Sistema Kardex Clínico — Proyecto Completo

## Estructura
```
kardex-sistema/
├── fase1-arquitectura/   — DB Schema + SQL + RLS
├── fase2-backend/        — Edge Functions + FEFO Engine + Emails
└── fase3-frontend/       — Next.js App Router UI completa
```

## Orden de deploy

### 1. Base de datos (Supabase SQL Editor)
```sql
\i fase1-arquitectura/fase1-db-schema.sql
\i fase1-arquitectura/fase1-atomic-functions.sql
\i fase1-arquitectura/fase1-db-additions.sql
\i fase2-backend/supabase/fase2-additions.sql
```

### 2. Edge Functions
```bash
cd fase2-backend
supabase functions deploy register-entry
supabase functions deploy register-exit
supabase functions deploy register-adjustment
supabase functions deploy expiry-scanner
```

### 3. Frontend
```bash
cd fase3-frontend
npm install
cp .env.example .env.local
# Configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Usuario de prueba
Si quieres entrar rápido al sistema, usa estas credenciales de demo:

- Email: demo@clinica.com
- Contraseña: Demo1234!
- Rol: admin

Para habilitarlo en tu proyecto de Supabase:

1. Crea el usuario en Auth con ese email y contraseña.
2. Ejecuta [fase1-arquitectura/fase1-demo-user.sql](fase1-arquitectura/fase1-demo-user.sql) para asignarle el rol admin.

## Tecnologías
- **DB**: PostgreSQL (Supabase) + RLS + Advisory Locks
- **Backend**: Deno Edge Functions + Resend (emails)
- **Frontend**: Next.js 14 App Router + Tailwind + shadcn/ui
- **Auth**: Supabase Auth (JWT)
- **Stock**: Calculado en vistas SQL — nunca manual
- **FEFO**: Implementado en PL/pgSQL con transacciones atómicas
