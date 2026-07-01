# FASE 2 — Backend + FEFO + Edge Functions

## Edge Functions (Deno)
- `register-entry` — entrada con creación atómica de lote
- `register-exit` — salida FEFO multi-lote (advisory lock en PG)
- `register-adjustment` — ajuste +/- solo admin
- `expiry-scanner` — CRON diario 07:00 UTC: alertas email

## Shared modules
- `_shared/fefo.ts` — FEFO engine + wrappers RPC
- `_shared/email.ts` — Resend + retry backoff exponencial
- `_shared/client.ts` — Supabase factory + auth helpers
- `_shared/types.ts` — tipos TypeScript

## Variables de entorno (Supabase Dashboard)
```
RESEND_API_KEY=re_xxx
EMAIL_FROM=kardex@clinica.com
EMAIL_ADMIN=farmacia@clinica.com
```

## Deploy
```bash
supabase functions deploy register-entry
supabase functions deploy register-exit
supabase functions deploy register-adjustment
supabase functions deploy expiry-scanner
```
