// ============================================================
// EMAIL SERVICE — Resend + retry con backoff exponencial
// ============================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL     = Deno.env.get("EMAIL_FROM")  ?? "kardex@clinica.com";
const ADMIN_EMAIL    = Deno.env.get("EMAIL_ADMIN") ?? "farmacia@clinica.com";

// ── Retry con backoff exponencial ───────────────────────────

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 300 } = opts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 300, 600, 1200 ms
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Core send (una llamada a Resend) ────────────────────────

interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
  tags?: Array<{ name: string; value: string }>;
}

interface ResendError {
  statusCode?: number;
  message?: string;
}

async function sendOnce(payload: EmailPayload): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      tags: payload.tags ?? [],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ResendError;
    // 4xx cliente no tiene sentido reintentar (API key inválida, etc.)
    if (res.status >= 400 && res.status < 500) {
      console.error("[EMAIL] Client error (no retry):", res.status, body);
      return; // best-effort; no lanzar para no bloquear la TX
    }
    // 5xx servidor: relanzar para que withRetry reintente
    throw new Error(`Resend ${res.status}: ${JSON.stringify(body)}`);
  }
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  await withRetry(() => sendOnce(payload), { maxAttempts: 3, baseDelayMs: 400 });
}

// ── HTML base reutilizable ───────────────────────────────────

function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body{font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:24px}
    .card{background:#fff;border-radius:8px;padding:24px;max-width:600px;margin:auto;
          box-shadow:0 1px 3px rgba(0,0,0,.12)}
    table{border-collapse:collapse;width:100%;font-size:14px}
    td,th{padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top}
    th{background:#f1f5f9;font-weight:600;text-align:left}
    .label{color:#64748b;width:170px}
    .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600}
    .green{background:#dcfce7;color:#15803d}
    .blue{background:#dbeafe;color:#1d4ed8}
    .red{background:#fee2e2;color:#b91c1c}
    .amber{background:#fef3c7;color:#92400e}
    footer{margin-top:16px;font-size:11px;color:#94a3b8;text-align:center}
  </style>
</head>
<body><div class="card">${content}<footer>Sistema Kardex Clínico · ${new Date().getFullYear()}</footer></div></body>
</html>`;
}

// ── TEMPLATES ───────────────────────────────────────────────

// 1. Entrada confirmada
export async function sendEntryConfirmed(params: {
  to: string;
  materialName: string;
  materialCode: string;
  quantity: number;
  unit: string;
  lotNumber?: string;
  expiryDate?: string;
  performedBy: string;
  reference?: string;
  timestamp: string;
}): Promise<void> {
  const lotRows = params.lotNumber
    ? `<tr><td class="label">Lote</td><td><strong>${params.lotNumber}</strong></td></tr>
       <tr><td class="label">Vence</td><td>${params.expiryDate}</td></tr>`
    : `<tr><td class="label">Vencimiento</td><td><em>Material sin vencimiento</em></td></tr>`;

  const html = baseHtml(`
    <h2 style="color:#15803d;margin-top:0">✅ Entrada de Material Confirmada</h2>
    <table>
      <tr><td class="label">Material</td><td><strong>${params.materialName}</strong></td></tr>
      <tr><td class="label">Código</td><td><span class="badge blue">${params.materialCode}</span></td></tr>
      <tr><td class="label">Cantidad ingresada</td><td><strong>${params.quantity} ${params.unit}</strong></td></tr>
      ${lotRows}
      <tr><td class="label">Referencia</td><td>${params.reference ?? "—"}</td></tr>
      <tr><td class="label">Registrado por</td><td>${params.performedBy}</td></tr>
      <tr><td class="label">Fecha / Hora</td><td>${new Date(params.timestamp).toLocaleString("es-PE")}</td></tr>
    </table>
  `);

  await sendEmail({
    to: [...new Set([params.to, ADMIN_EMAIL])],
    subject: `✅ Entrada: ${params.materialName} — ${params.quantity} ${params.unit}`,
    html,
    tags: [{ name: "template", value: "entry_confirmed" }],
  });
}

// 2. Salida confirmada (con detalle FEFO multi-lote)
export async function sendExitConfirmed(params: {
  to: string;
  materialName: string;
  materialCode: string;
  quantity: number;
  unit: string;
  environment: string;
  allocations: Array<{ lot_number: string; expiry_date: string; allocate_qty: number }>;
  performedBy: string;
  reference?: string;
  timestamp: string;
}): Promise<void> {
  const allocationSection = params.allocations.length > 0
    ? `<h3 style="margin:20px 0 8px;font-size:14px;color:#334155">
         Lotes consumidos — FEFO (${params.allocations.length} lote${params.allocations.length > 1 ? "s" : ""})
       </h3>
       <table>
         <thead><tr><th>Nº Lote</th><th>Vence</th><th>Cantidad</th></tr></thead>
         <tbody>
           ${params.allocations
             .map((a) => {
               const daysLeft = Math.ceil(
                 (new Date(a.expiry_date).getTime() - Date.now()) / 86400000
               );
               const badge = daysLeft <= 7 ? "red" : daysLeft <= 30 ? "amber" : "green";
               return `<tr>
                 <td>${a.lot_number}</td>
                 <td><span class="badge ${badge}">${a.expiry_date}</span></td>
                 <td>${a.allocate_qty} ${params.unit}</td>
               </tr>`;
             })
             .join("")}
         </tbody>
       </table>`
    : `<p style="color:#64748b;font-size:13px"><em>Material sin vencimiento — movimiento directo</em></p>`;

  const html = baseHtml(`
    <h2 style="color:#1d4ed8;margin-top:0">📤 Salida de Material Confirmada</h2>
    <table>
      <tr><td class="label">Material</td><td><strong>${params.materialName}</strong></td></tr>
      <tr><td class="label">Código</td><td><span class="badge blue">${params.materialCode}</span></td></tr>
      <tr><td class="label">Cantidad total</td><td><strong>${params.quantity} ${params.unit}</strong></td></tr>
      <tr><td class="label">Servicio / Entorno</td><td>${params.environment}</td></tr>
      <tr><td class="label">Referencia</td><td>${params.reference ?? "—"}</td></tr>
      <tr><td class="label">Registrado por</td><td>${params.performedBy}</td></tr>
      <tr><td class="label">Fecha / Hora</td><td>${new Date(params.timestamp).toLocaleString("es-PE")}</td></tr>
    </table>
    ${allocationSection}
  `);

  await sendEmail({
    to: [...new Set([params.to, ADMIN_EMAIL])],
    subject: `📤 Salida: ${params.materialName} — ${params.quantity} ${params.unit} → ${params.environment}`,
    html,
    tags: [{ name: "template", value: "exit_confirmed" }],
  });
}

// 3. Alerta stock bajo mínimo
export async function sendLowStockAlert(params: {
  materialName: string;
  materialCode: string;
  currentQty: number;
  minStock: number;
  unit: string;
}): Promise<void> {
  const pct = params.minStock > 0
    ? Math.round((params.currentQty / params.minStock) * 100)
    : 0;

  const html = baseHtml(`
    <h2 style="color:#b91c1c;margin-top:0">⚠️ Stock por Debajo del Mínimo</h2>
    <table>
      <tr><td class="label">Material</td><td><strong>${params.materialName}</strong></td></tr>
      <tr><td class="label">Código</td><td><span class="badge blue">${params.materialCode}</span></td></tr>
      <tr>
        <td class="label">Stock actual</td>
        <td><span class="badge red"><strong>${params.currentQty} ${params.unit}</strong></span></td>
      </tr>
      <tr><td class="label">Stock mínimo</td><td>${params.minStock} ${params.unit}</td></tr>
      <tr><td class="label">Nivel</td><td>${pct}% del mínimo requerido</td></tr>
    </table>
    <p style="margin-top:16px;padding:12px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;font-size:13px">
      <strong>Acción requerida:</strong> Iniciar proceso de reposición de inventario.
    </p>
  `);

  await sendEmail({
    to: [ADMIN_EMAIL],
    subject: `⚠️ Stock bajo: ${params.materialName} (${params.currentQty}/${params.minStock} ${params.unit})`,
    html,
    tags: [{ name: "template", value: "low_stock_alert" }],
  });
}

// 4. Alerta lotes próximos a vencer
export async function sendExpiryAlert(params: {
  materialName: string;
  materialCode: string;
  lots: Array<{ lot_number: string; expiry_date: string; available_qty: number }>;
  unit: string;
  daysUntilExpiry: number;
}): Promise<void> {
  const rows = params.lots.map((l) => {
    const daysLeft = Math.ceil(
      (new Date(l.expiry_date).getTime() - Date.now()) / 86400000
    );
    const badge = daysLeft <= 7 ? "red" : daysLeft <= 30 ? "amber" : "green";
    return `<tr>
      <td>${l.lot_number}</td>
      <td><span class="badge ${badge}">${l.expiry_date}</span> (${daysLeft}d)</td>
      <td>${l.available_qty} ${params.unit}</td>
    </tr>`;
  }).join("");

  const html = baseHtml(`
    <h2 style="color:#92400e;margin-top:0">🕐 Lotes Próximos a Vencer</h2>
    <p style="color:#64748b;font-size:13px">
      Los siguientes lotes de <strong>${params.materialName}</strong>
      vencen en menos de <strong>${params.daysUntilExpiry} días</strong>.
    </p>
    <table>
      <thead>
        <tr><th>Nº Lote</th><th>Fecha Vencimiento</th><th>Stock Disponible</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;padding:12px;background:#fffbeb;border-left:4px solid #d97706;border-radius:4px;font-size:13px">
      <strong>Protocolo FEFO:</strong> Priorizar el consumo de estos lotes antes que los de vencimiento más lejano.
    </p>
  `);

  await sendEmail({
    to: [ADMIN_EMAIL],
    subject: `🕐 Vencimiento en ${params.daysUntilExpiry}d: ${params.materialName} — ${params.lots.length} lote(s)`,
    html,
    tags: [
      { name: "template", value: "expiry_alert" },
      { name: "days", value: String(params.daysUntilExpiry) },
    ],
  });
}
