// ============================================================
// EDGE FUNCTION: expiry-scanner (CRON diario — 07:00 UTC)
// supabase/config.toml:
//   [functions.expiry-scanner]
//   schedule = "0 7 * * *"
// ============================================================
import { getServiceClient, jsonResponse } from "../_shared/client.ts";
import { sendExpiryAlert, sendLowStockAlert } from "../_shared/email.ts";

const EXPIRY_WINDOWS = [7, 30, 60]; // días — alertas escalonadas

Deno.serve(async (req: Request) => {
  // Solo Supabase scheduler puede invocar esta función
  const key = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (key !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const service = getServiceClient();
  const today   = new Date().toISOString().split("T")[0];
  const summary: Record<string, unknown> = {};

  // ── 1. Escanear por ventana de vencimiento ───────────────
  for (const days of EXPIRY_WINDOWS) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + days);
    const thresholdStr = threshold.toISOString().split("T")[0];

    const { data: expiringLots, error } = await service
      .from("fefo_queue")
      .select("material_id, lot_id, lot_number, expiry_date, available_qty, material_name, unit")
      .lte("expiry_date", thresholdStr)
      .gte("expiry_date", today)   // excluir vencidos con stock 0 por FEFO
      .gt("available_qty", 0)
      .order("expiry_date", { ascending: true });

    if (error) {
      console.error(`[expiry-scanner] Error fetching ${days}d window:`, error.message);
      summary[`expiry_${days}d`] = { error: error.message };
      continue;
    }

    if (!expiringLots?.length) {
      summary[`expiry_${days}d`] = { alerted: 0 };
      continue;
    }

    // Agrupar por material para un email por material
    const byMaterial = new Map<string, typeof expiringLots>();
    for (const lot of expiringLots) {
      const key = lot.material_id;
      if (!byMaterial.has(key)) byMaterial.set(key, []);
      byMaterial.get(key)!.push(lot);
    }

    let alertCount = 0;
    for (const [, lots] of byMaterial) {
      try {
        await sendExpiryAlert({
          materialName:    lots[0].material_name,
          materialCode:    lots[0].material_id, // fefo_queue no expone code; usar si se añade al view
          lots:            lots.map((l) => ({
            lot_number:   l.lot_number,
            expiry_date:  l.expiry_date,
            available_qty: l.available_qty,
          })),
          unit:            lots[0].unit,
          daysUntilExpiry: days,
        });
        alertCount++;
      } catch (e) {
        console.error(`[expiry-scanner] sendExpiryAlert failed:`, e);
      }
    }

    summary[`expiry_${days}d`] = { alerted: alertCount };
  }

  // ── 2. Stock bajo mínimo ─────────────────────────────────
  const { data: lowStockItems, error: lsError } = await service
    .from("stock_alerts")
    .select("material_id, material_name, material_code, total_qty, min_stock, unit")
    .eq("low_stock", true);

  if (lsError) {
    summary["low_stock"] = { error: lsError.message };
  } else {
    let alertCount = 0;
    for (const item of lowStockItems ?? []) {
      try {
        await sendLowStockAlert({
          materialName: item.material_name,
          materialCode: item.material_code,
          currentQty:  item.total_qty,
          minStock:    item.min_stock,
          unit:        item.unit,
        });
        alertCount++;
      } catch (e) {
        console.error(`[expiry-scanner] sendLowStockAlert failed:`, e);
      }
    }
    summary["low_stock"] = { alerted: alertCount };
  }

  console.log("[expiry-scanner] Done:", JSON.stringify(summary));
  return jsonResponse({ success: true, data: summary });
});
