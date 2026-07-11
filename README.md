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

## Usuarios de prueba
Si quieres entrar rápido al sistema, crea estos usuarios en Supabase Auth:

- Angello
	- Email: angelloevolution@evolution.com
	- Contraseña: angello0912
- Janet
	- Email: janetevolution@evolution.com
	- Contraseña: janet123
- Evolution
	- Email: evolutionadmin@evolution.com
	- Contraseña: evolution1223

Después ejecuta [fase1-arquitectura/fase1-demo-user.sql](fase1-arquitectura/fase1-demo-user.sql) para asignarles el rol admin.

Si quieres que el nombre se vea correcto en el perfil, guarda el full name en la metadata de Auth con el mismo valor del usuario.

## Tecnologías
- **DB**: PostgreSQL (Supabase) + RLS + Advisory Locks
- **Backend**: Deno Edge Functions + Resend (emails)
- **Frontend**: Next.js 14 App Router + Tailwind + shadcn/ui
- **Auth**: Supabase Auth (JWT)
- **Stock**: Calculado en vistas SQL — nunca manual
- **FEFO**: Implementado en PL/pgSQL con transacciones atómicas
