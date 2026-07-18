"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { PageHeader, MovementBadge, LoadingSpinner, EmptyState } from "@/components/shared";
import {
  useAllLots,
  useEnvironments,
  useAllEnvironments,
  useKardex,
  useMaterialCategories,
  useMaterials,
  useMovements,
  useStockAlerts,
  useStockByLot,
  useStockByMaterial,
  useSuppliers,
} from "@/lib/hooks";
import {
  formatDate,
  formatDateTime,
  formatQty,
  movementLabel,
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import { BarChart2, Calendar, FileText, Table2 } from "lucide-react";
import type { Movement, StockByLot, StockByMaterial } from "@/types";

type ReportTemplateId =
  | "stock-actual"
  | "kardex-movimientos"
  | "consumo-material"
  | "materiales-bajo-stock";

type TypeFilter = "all" | "entry" | "exit" | "adjustment";
type ColumnAlign = "left" | "right";

type ReportColumn = {
  id: string;
  label: string;
  align?: ColumnAlign;
  render: (row: Record<string, unknown>) => string;
};

type SummaryCard = {
  label: string;
  value: string;
  note?: string;
  tone?: "slate" | "emerald" | "blue" | "amber" | "red";
};

type ReportConfig = {
  title: string;
  description: string;
  rows: Record<string, unknown>[];
  columns: ReportColumn[];
  defaultColumnIds: string[];
  summaryCards: SummaryCard[];
  emptyTitle: string;
  emptyDescription: string;
};

const TEMPLATES: Record<ReportTemplateId, { label: string; description: string; defaultColumns: string[] }> = {
  "stock-actual": {
    label: "Stock actual",
    description: "Consulta el stock actual por material y elige las columnas antes de descargar",
    defaultColumns: ["material_name", "material_code", "category", "unit", "stock_actual", "stock_total", "supplier"],
  },
  "kardex-movimientos": {
    label: "Kardex de movimientos",
    description: "Vista cronológica del Kardex por material seleccionado",
    defaultColumns: ["performed_at", "type", "material_name", "material_code", "quantity_in", "quantity_out", "running_total", "stock_actual", "environment", "performed_by"],
  },
  "consumo-material": {
    label: "Consumo por material",
    description: "Resumen conjunto del consumo de materiales en el período seleccionado",
    defaultColumns: ["material_name", "category", "unit", "consumed_qty", "stock_actual"],
  },
  "materiales-bajo-stock": {
    label: "Materiales bajo stock",
    description: "Materiales que están por debajo del stock mínimo",
    defaultColumns: ["material_name", "category", "unit", "stock_actual", "min_stock", "difference"],
  },
};

const REPORT_COLUMNS_STORAGE_KEY = "kardex.reportes.columnas.v1";

function getDefaultColumnSettings() {
  return {
    "stock-actual": TEMPLATES["stock-actual"].defaultColumns,
    "kardex-movimientos": TEMPLATES["kardex-movimientos"].defaultColumns,
    "consumo-material": TEMPLATES["consumo-material"].defaultColumns,
    "materiales-bajo-stock": TEMPLATES["materiales-bajo-stock"].defaultColumns,
  } satisfies Record<ReportTemplateId, string[]>;
}

function todayDateValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function daysAgoDateValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function dateValueToIsoStart(value?: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00`).toISOString();
}

function dateValueToIsoEnd(value?: string) {
  if (!value) return undefined;
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("es-PE");
  return String(value);
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReportesPanel() {
  const [reportTemplate, setReportTemplate] = useState<ReportTemplateId>("stock-actual");
  const [selectedColumns, setSelectedColumns] = useState<string[]>(TEMPLATES["stock-actual"].defaultColumns);
  const [columnSettingsByTemplate, setColumnSettingsByTemplate] = useState<Record<ReportTemplateId, string[]>>(
    getDefaultColumnSettings()
  );
  const [fromDate, setFromDate] = useState(() => daysAgoDateValue(30));
  const [toDate, setToDate] = useState(() => todayDateValue());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);

  const { data: materials } = useMaterials();
  const { data: suppliers } = useSuppliers();
  const { data: lots } = useAllLots(materialFilter || undefined);
  const { data: environments } = useEnvironments();
  const { data: allEnvironments } = useAllEnvironments();
  const { data: categories } = useMaterialCategories();
  const { data: stockAlerts } = useStockAlerts();
  const { data: stockByLot } = useStockByLot(materialFilter || undefined);
  const { data: stockByMaterial } = useStockByMaterial();
  const { data: movements, loading: movementsLoading } = useMovements({
    type: typeFilter !== "all" ? typeFilter : undefined,
    material_id: materialFilter || undefined,
    environment_id: environmentFilter || undefined,
    from: dateValueToIsoStart(fromDate),
    to: dateValueToIsoEnd(toDate),
    limit: 1000,
  });
  const { data: kardexRows, loading: kardexLoading } = useKardex(
    materialFilter,
    dateValueToIsoStart(fromDate),
    dateValueToIsoEnd(toDate)
  );

  const materialsMap = useMemo(() => new Map((materials ?? []).map((item) => [item.id, item])), [materials]);
  const suppliersMap = useMemo(() => new Map((suppliers ?? []).map((item) => [item.id, item])), [suppliers]);
  const lotsMap = useMemo(() => new Map((lots ?? []).map((item) => [item.id, item])), [lots]);
  const environmentsMap = useMemo(() => new Map((allEnvironments ?? []).map((item) => [item.id, item])), [allEnvironments]);
  const movementNotesMap = useMemo(
    () => new Map((movements ?? []).map((movement) => [movement.id, movement.notes ?? movement.reference ?? null])),
    [movements]
  );
  const stockTotalsMap = useMemo(
    () => new Map((stockByMaterial ?? []).map((item) => [item.material_id, item])),
    [stockByMaterial]
  );

  const rangeLabel = fromDate && toDate
    ? `${formatDate(fromDate)} al ${formatDate(toDate)}`
    : fromDate
      ? `Desde ${formatDate(fromDate)}`
      : toDate
        ? `Hasta ${formatDate(toDate)}`
        : "Sin rango";

  useEffect(() => {
    setExporting(null);
    if (reportTemplate === "consumo-material") {
      setTypeFilter("exit");
    } else {
      setTypeFilter("all");
    }
  }, [reportTemplate]);

  useEffect(() => {
    try {
      const savedSettings = window.localStorage.getItem(REPORT_COLUMNS_STORAGE_KEY);
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings) as Partial<Record<ReportTemplateId, string[]>>;
        const defaults = getDefaultColumnSettings();
        const mergedSettings = {
          ...defaults,
          ...Object.fromEntries(
            Object.entries(parsedSettings).filter((entry): entry is [ReportTemplateId, string[]] => {
              const [templateId, columns] = entry;
              return templateId in defaults && Array.isArray(columns);
            })
          ),
        } satisfies Record<ReportTemplateId, string[]>;

        setColumnSettingsByTemplate(mergedSettings);
        setSelectedColumns(mergedSettings[reportTemplate]);
      }
    } catch {
      setColumnSettingsByTemplate(getDefaultColumnSettings());
      setSelectedColumns(TEMPLATES[reportTemplate].defaultColumns);
    } finally {
      setSettingsReady(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setColumnSettingsByTemplate((current) => ({
      ...current,
      [reportTemplate]: selectedColumns,
    }));
  }, [selectedColumns, reportTemplate]);

  useEffect(() => {
    if (!settingsReady) return;
    window.localStorage.setItem(REPORT_COLUMNS_STORAGE_KEY, JSON.stringify(columnSettingsByTemplate));
  }, [columnSettingsByTemplate, settingsReady]);

  const handleTemplateChange = (templateId: ReportTemplateId) => {
    setColumnSettingsByTemplate((current) => ({
      ...current,
      [reportTemplate]: selectedColumns,
    }));
    setReportTemplate(templateId);
    setSelectedColumns(columnSettingsByTemplate[templateId]);
  };

  const stockActualRows = useMemo(() => {
    return (stockByLot ?? [])
      .filter((row) => !categoryFilter || (materialsMap.get(row.material_id)?.category ?? "") === categoryFilter)
      .map((row) => {
        const lot = lotsMap.get(row.lot_id);
        const material = materialsMap.get(row.material_id);
        const stockTotal = stockTotalsMap.get(row.material_id)?.total_qty ?? row.available_qty;
        return {
          material_id: row.material_id,
          material_name: row.material_name,
          material_code: row.material_code,
          category: material?.category ?? "—",
          unit: row.unit,
          stock_actual: row.available_qty,
          stock_total: stockTotal,
          supplier: lot?.supplier_id ? (suppliersMap.get(lot.supplier_id)?.name ?? "—") : "—",
          lot_number: row.lot_number,
        };
      });
  }, [stockByLot, categoryFilter, materialsMap, lotsMap, suppliersMap, stockTotalsMap]);

  const kardexReportRows = useMemo(() => {
    if (!materialFilter) return [];
    const material = materialsMap.get(materialFilter);
    const currentStock = stockTotalsMap.get(materialFilter);
    const selectedEnvironmentName = environmentFilter ? environmentsMap.get(environmentFilter)?.name ?? null : null;
    return (kardexRows ?? []).map((row) => ({
      material_id: materialFilter,
      performed_at: row.performed_at,
      type: row.type,
      material_name: material?.name ?? "—",
      material_code: material?.code ?? "—",
      category: material?.category ?? "—",
      unit: material?.unit ?? "—",
      quantity_in: row.quantity_in,
      quantity_out: row.quantity_out,
      running_total: row.running_total,
      stock_actual: currentStock?.total_qty ?? row.running_total,
      environment: row.environment ?? environmentsMap.get(row.environment_id ?? "")?.name ?? "—",
      performed_by: row.performed_by ?? "—",
      notes: row.notes ?? movementNotesMap.get(row.movement_id) ?? row.reference ?? "—",
      lot_number: row.lot_number ?? "—",
    })).filter((row) => !selectedEnvironmentName || row.environment === selectedEnvironmentName);
  }, [kardexRows, materialFilter, materialsMap, stockTotalsMap, environmentFilter, environmentsMap, movementNotesMap]);

  const consumptionRows = useMemo(() => {
    const grouped = new Map<string, {
      material_id: string;
      material_name: string;
      material_code: string;
      category: string;
      unit: string;
      consumed_qty: number;
      stock_actual: number;
    }>();

    (movements ?? [])
      .filter((movement) => movement.type === "exit")
      .forEach((movement) => {
        const material = materialsMap.get(movement.material_id);
        const current = grouped.get(movement.material_id) ?? {
          material_id: movement.material_id,
          material_name: material?.name ?? (movement.material as { name: string } | undefined)?.name ?? "—",
          material_code: material?.code ?? (movement.material as { code: string } | undefined)?.code ?? "",
          category: material?.category ?? (movement.material as { category?: string | null } | undefined)?.category ?? "—",
          unit: material?.unit ?? (movement.material as { unit: string } | undefined)?.unit ?? "—",
          consumed_qty: 0,
          stock_actual: stockTotalsMap.get(movement.material_id)?.total_qty ?? 0,
        };
        current.consumed_qty += movement.quantity;
        current.stock_actual = stockTotalsMap.get(movement.material_id)?.total_qty ?? current.stock_actual;
        grouped.set(movement.material_id, current);
      });

    return Array.from(grouped.values()).sort((a, b) => b.consumed_qty - a.consumed_qty);
  }, [movements, materialsMap, stockTotalsMap]);

  const lowStockRows = useMemo(() => {
    return (stockAlerts ?? [])
      .filter((alert) => alert.low_stock)
      .filter((alert) => !materialFilter || alert.material_id === materialFilter)
      .filter((alert) => !categoryFilter || (materialsMap.get(alert.material_id)?.category ?? "") === categoryFilter)
      .map((alert) => ({
        material_id: alert.material_id,
        material_name: alert.material_name,
        material_code: alert.material_code,
        category: materialsMap.get(alert.material_id)?.category ?? "—",
        unit: alert.unit,
        stock_actual: alert.total_qty,
        min_stock: alert.min_stock,
        difference: alert.total_qty - alert.min_stock,
      }));
  }, [stockAlerts, materialFilter, categoryFilter, materialsMap]);

  const stockSelected = materialFilter ? (stockTotalsMap.get(materialFilter) ?? null) : null;

  const reportConfig = useMemo<ReportConfig>(() => {
    switch (reportTemplate) {
      case "stock-actual": {
        const columns: ReportColumn[] = [
          { id: "material_name", label: "Nombre del material", render: (row) => String(row.material_name ?? "—") },
          { id: "stock_actual", label: "Stock actual", align: "right", render: (row) => formatQty(Number(row.stock_actual ?? 0), String(row.unit ?? "")) },
          { id: "category", label: "Categoría", render: (row) => String(row.category ?? "—") },
          { id: "unit", label: "Unidad", render: (row) => String(row.unit ?? "—") },
          { id: "supplier", label: "Proveedor", render: (row) => String(row.supplier ?? "—") },
          { id: "lot_number", label: "Lote", render: (row) => String(row.lot_number ?? "—") },
          { id: "stock_total", label: "Stock total material", align: "right", render: (row) => formatCellValue(row.stock_total) },
        ];
        return {
          title: "Reporte de Stock Actual",
          description: TEMPLATES[reportTemplate].description,
          rows: stockActualRows,
          columns,
          defaultColumnIds: TEMPLATES[reportTemplate].defaultColumns,
          summaryCards: [
            { label: "Lotes", value: stockActualRows.length.toLocaleString("es-PE"), note: "Registros disponibles" },
            { label: "Materiales", value: new Set(stockActualRows.map((row) => row.material_id)).size.toLocaleString("es-PE"), note: "Materiales únicos" },
            { label: "Stock seleccionado", value: stockSelected ? formatQty(stockSelected.total_qty, stockSelected.unit) : "—", note: materialFilter ? "Material actual" : "Selecciona un material" },
          ],
          emptyTitle: "Sin stock disponible",
          emptyDescription: "No hay registros de stock para los filtros seleccionados.",
        };
      }
      case "kardex-movimientos": {
        const columns: ReportColumn[] = [
          { id: "performed_at", label: "Fecha / hora", render: (row) => formatDateTime(String(row.performed_at ?? "")) },
          { id: "type", label: "Tipo", render: (row) => movementLabel(String(row.type ?? "" ) as Movement["type"]) },
          { id: "material_name", label: "Material", render: (row) => String(row.material_name ?? "—") },
          { id: "quantity_in", label: "Entrada", align: "right", render: (row) => Number(row.quantity_in ?? 0) > 0 ? `+${Number(row.quantity_in).toLocaleString("es-PE")}` : "—" },
          { id: "quantity_out", label: "Salida", align: "right", render: (row) => Number(row.quantity_out ?? 0) > 0 ? `-${Number(row.quantity_out).toLocaleString("es-PE")}` : "—" },
          { id: "running_total", label: "Saldo corrido", align: "right", render: (row) => Number(row.running_total ?? 0).toLocaleString("es-PE") },
          { id: "stock_actual", label: "Stock actual", align: "right", render: (row) => formatQty(Number(row.stock_actual ?? 0), String(row.unit ?? "")) },
          { id: "environment", label: "Ambiente", render: (row) => String(row.environment ?? "—") },
          { id: "performed_by", label: "Registrado por", render: (row) => String(row.performed_by ?? "—") },
          { id: "notes", label: "Notas", render: (row) => String(row.notes ?? "—") },
        ];
        return {
          title: "Kardex de movimientos",
          description: TEMPLATES[reportTemplate].description,
          rows: kardexReportRows,
          columns,
          defaultColumnIds: TEMPLATES[reportTemplate].defaultColumns,
          summaryCards: [
            { label: "Movimientos", value: kardexReportRows.length.toLocaleString("es-PE"), note: materialFilter ? "Material seleccionado" : "Selecciona un material" },
            { label: "Entradas", value: kardexReportRows.reduce((sum, row) => sum + Number(row.quantity_in ?? 0), 0).toLocaleString("es-PE"), note: "Unidades" },
            { label: "Salidas", value: kardexReportRows.reduce((sum, row) => sum + Number(row.quantity_out ?? 0), 0).toLocaleString("es-PE"), note: "Unidades" },
          ],
          emptyTitle: materialFilter ? "Sin movimientos" : "Selecciona un material",
          emptyDescription: materialFilter ? "No hay movimientos para el rango seleccionado." : "El Kardex requiere seleccionar un material.",
        };
      }
      case "consumo-material": {
        const columns: ReportColumn[] = [
          { id: "material_name", label: "Material", render: (row) => String(row.material_name ?? "—") },
          { id: "category", label: "Categoría", render: (row) => String(row.category ?? "—") },
          { id: "unit", label: "Unidad", render: (row) => String(row.unit ?? "—") },
          { id: "consumed_qty", label: "Consumo", align: "right", render: (row) => formatCellValue(row.consumed_qty) },
          { id: "stock_actual", label: "Stock actual", align: "right", render: (row) => formatQty(Number(row.stock_actual ?? 0), String(row.unit ?? "")) },
        ];
        return {
          title: "Consumo por material",
          description: TEMPLATES[reportTemplate].description,
          rows: consumptionRows,
          columns,
          defaultColumnIds: TEMPLATES[reportTemplate].defaultColumns,
          summaryCards: [
            { label: "Materiales", value: consumptionRows.length.toLocaleString("es-PE"), note: "Materiales consumidos" },
            { label: "Consumo total", value: consumptionRows.reduce((sum, row) => sum + Number(row.consumed_qty ?? 0), 0).toLocaleString("es-PE"), note: "Unidades" },
            { label: "Stock actual", value: stockSelected ? formatQty(stockSelected.total_qty, stockSelected.unit) : "—", note: "Material seleccionado" },
          ],
          emptyTitle: "Sin consumo",
          emptyDescription: "No hay salidas registradas en el período seleccionado.",
        };
      }
      case "materiales-bajo-stock": {
        const columns: ReportColumn[] = [
          { id: "material_name", label: "Material", render: (row) => String(row.material_name ?? "—") },
          { id: "category", label: "Categoría", render: (row) => String(row.category ?? "—") },
          { id: "unit", label: "Unidad", render: (row) => String(row.unit ?? "—") },
          { id: "stock_actual", label: "Stock actual", align: "right", render: (row) => formatCellValue(row.stock_actual) },
          { id: "min_stock", label: "Stock mínimo", align: "right", render: (row) => formatCellValue(row.min_stock) },
          { id: "difference", label: "Diferencia", align: "right", render: (row) => formatCellValue(row.difference) },
        ];
        const totalDifference = lowStockRows.reduce((sum, row) => sum + Number(row.difference ?? 0), 0);
        return {
          title: "Materiales bajo stock",
          description: TEMPLATES[reportTemplate].description,
          rows: lowStockRows,
          columns,
          defaultColumnIds: TEMPLATES[reportTemplate].defaultColumns,
          summaryCards: [
            { label: "Materiales", value: lowStockRows.length.toLocaleString("es-PE"), note: "Con alerta activa" },
            { label: "Diferencia total", value: totalDifference.toLocaleString("es-PE"), note: "Stock por debajo del mínimo" },
            { label: "Stock seleccionado", value: stockSelected ? formatQty(stockSelected.total_qty, stockSelected.unit) : "—", note: materialFilter ? "Material actual" : "Selecciona un material" },
          ],
          emptyTitle: "Sin alertas de stock",
          emptyDescription: "No hay materiales bajo el stock mínimo con los filtros actuales.",
        };
      }
    }
  }, [
    reportTemplate,
    stockActualRows,
    kardexReportRows,
    consumptionRows,
    lowStockRows,
    stockSelected,
  ]);

  const visibleColumns = useMemo(
    () => reportConfig.columns.filter((column) => selectedColumns.includes(column.id)),
    [reportConfig.columns, selectedColumns]
  );

  const canExport = visibleColumns.length > 0 && reportConfig.rows.length > 0;

  const buildExportRows = useCallback(() => {
    return reportConfig.rows.map((row) => {
      const record: Record<string, string> = {};
      visibleColumns.forEach((column) => {
        record[column.label] = column.render(row);
      });
      return record;
    });
  }, [reportConfig.rows, visibleColumns]);

  const exportExcel = useCallback(async () => {
    if (!canExport) return;
    setExporting("excel");
    try {
      const XLSX = await import("xlsx");
      const rows = buildExportRows();
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reporte");
      XLSX.writeFile(wb, `kardex-reporte-${reportTemplate}-${fromDate || "inicio"}-${toDate || "fin"}.xlsx`);
    } finally {
      setExporting(null);
    }
  }, [canExport, buildExportRows, reportTemplate, fromDate, toDate]);

  const exportPdf = useCallback(() => {
    if (!canExport) return;
    setExporting("pdf");
    const rows = buildExportRows();
    const tableRows = rows.map((row) => {
      const cells = visibleColumns.map((column) => `<td>${row[column.label] ?? "—"}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    const headers = visibleColumns.map((column) => `<th>${column.label}</th>`).join("");
    const html = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <title>${reportConfig.title}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
        h1{font-size:16px;margin-bottom:4px}
        p{color:#666;margin-bottom:16px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f1f5f9;font-weight:600}
        tr:nth-child(even){background:#f8fafc}
        @media print{button{display:none}}
      </style>
      <script>
        window.addEventListener('load', function () {
          setTimeout(function () {
            window.focus();
            window.print();
          }, 250);
        });
        window.addEventListener('afterprint', function () {
          window.close();
        });
      </script>
    </head><body>
      <h1>${reportConfig.title}</h1>
      <p>Rango: ${rangeLabel} · Generado: ${new Date().toLocaleString("es-PE")}</p>
      <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;background:#0b1726;color:white;border:none;border-radius:6px;cursor:pointer">Imprimir / Guardar PDF</button>
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </body></html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
    }
    setExporting(null);
  }, [canExport, buildExportRows, visibleColumns, reportConfig.title, rangeLabel]);

  const toggleColumn = (columnId: string) => {
    setSelectedColumns((current) => {
      if (current.includes(columnId)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== columnId);
      }
      return [...current, columnId];
    });
  };

  const isKardex = reportTemplate === "kardex-movimientos";
  const isStockActual = reportTemplate === "stock-actual";

  return (
    <div>
      <Header title="Reportes" subtitle="Análisis y exportación de datos de inventario" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title={reportConfig.title}
          description={reportConfig.description}
          action={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                onClick={exportPdf}
                disabled={!canExport || exporting !== null}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors sm:w-auto">
                <FileText className="h-4 w-4 text-red-500" />
                {exporting === "pdf" ? "Generando..." : "Exportar PDF"}
              </button>
              <button
                onClick={exportExcel}
                disabled={!canExport || exporting !== null}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors sm:w-auto">
                <Table2 className="h-4 w-4 text-emerald-600" />
                {exporting === "excel" ? "Generando..." : "Exportar Excel"}
              </button>
            </div>
          }
        />

        {/* Quick templates */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">Plantillas rápidas</h3>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            {(Object.entries(TEMPLATES) as Array<[ReportTemplateId, { label: string; description: string; defaultColumns: string[] }]>)
              .map(([id, template]) => (
                <button
                  key={id}
                  onClick={() => handleTemplateChange(id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    reportTemplate === id
                      ? "border-ev-gold bg-amber-50 text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}>
                  <p className="text-sm font-semibold">{template.label}</p>
                  <p className="text-xs text-slate-500">{template.description}</p>
                </button>
              ))}
          </div>
        </div>

        {/* Column config */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Configuración de columnas</h3>
              <p className="text-xs text-slate-500">Selecciona qué información incluir en la descarga.</p>
            </div>
            <button
              onClick={() => setSelectedColumns(reportConfig.defaultColumnIds)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              Restaurar plantilla
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {reportConfig.columns.map((column) => (
              <label key={column.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(column.id)}
                  onChange={() => toggleColumn(column.id)}
                  className="h-4 w-4 rounded border-slate-300 text-ev-gold focus:ring-ev-gold"
                />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 mb-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                <Calendar className="inline h-3 w-3 mr-1" />Rango de fechas
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ev-gold focus:outline-none"
                />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ev-gold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de movimiento</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ev-gold focus:outline-none">
                <option value="all">Todos</option>
                <option value="entry">Entradas</option>
                <option value="exit">Salidas</option>
                <option value="adjustment">Ajustes</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Categoría</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ev-gold focus:outline-none">
                <option value="">Todas las categorías</option>
                {(categories ?? []).filter((category) => category.is_active).map((category) => (
                  <option key={category.id} value={category.name}>{category.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Material</label>
              <select
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ev-gold focus:outline-none">
                <option value="">Todos los materiales</option>
                {materials?.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ambiente</label>
              <select
                value={environmentFilter}
                onChange={(e) => setEnvironmentFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-ev-gold focus:outline-none">
                <option value="">Todos los ambientes</option>
                {environments?.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {reportConfig.summaryCards.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            {reportConfig.summaryCards.map((card) => (
              <div
                key={card.label}
                className={cn(
                  "rounded-xl border shadow-sm p-4 bg-white",
                  card.tone === "emerald" && "border-emerald-200 bg-emerald-50",
                  card.tone === "blue" && "border-blue-200 bg-blue-50",
                  card.tone === "amber" && "border-amber-200 bg-amber-50",
                  card.tone === "red" && "border-red-200 bg-red-50",
                  (!card.tone || card.tone === "slate") && "border-slate-200 bg-white"
                )}>
                <p className={cn(
                  "text-xs uppercase tracking-wide font-medium",
                  card.tone === "emerald" && "text-emerald-600",
                  card.tone === "blue" && "text-blue-600",
                  card.tone === "amber" && "text-amber-600",
                  card.tone === "red" && "text-red-600",
                  (!card.tone || card.tone === "slate") && "text-slate-500"
                )}>{card.label}</p>
                <p className={cn(
                  "text-2xl font-bold mt-1 text-slate-900",
                  card.tone === "emerald" && "text-emerald-700",
                  card.tone === "blue" && "text-blue-700",
                  card.tone === "amber" && "text-amber-700",
                  card.tone === "red" && "text-red-700"
                )}>{card.value}</p>
                {card.note && <p className="text-xs text-slate-400 mt-1">{card.note}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Data table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <BarChart2 className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">
              {reportConfig.rows.length} registros · {rangeLabel}
            </h3>
            {isKardex && !materialFilter && (
              <span className="ml-auto text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                Selecciona un material para ver el Kardex
              </span>
            )}
          </div>

          {(reportTemplate === "kardex-movimientos" ? kardexLoading : movementsLoading) ? (
            <LoadingSpinner />
          ) : !reportConfig.rows.length ? (
            <EmptyState title={reportConfig.emptyTitle} description={reportConfig.emptyDescription} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th
                        key={column.id}
                        className={cn(
                          "px-4 py-3 font-medium",
                          column.align === "right" ? "text-right" : "text-left"
                        )}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {reportConfig.rows.map((row, index) => (
                    <tr key={`${reportTemplate}-${index}`} className="hover:bg-slate-50 transition-colors">
                      {visibleColumns.map((column) => (
                        <td
                          key={column.id}
                          className={cn(
                            "px-4 py-3 text-xs text-slate-500",
                            column.align === "right" && "text-right",
                            column.id === "material_name" && "text-slate-900",
                          )}>
                          {column.id === "type" && reportTemplate === "kardex-movimientos"
                            ? <MovementBadge type={String(row.type ?? "entry") as Movement["type"]} />
                            : column.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
