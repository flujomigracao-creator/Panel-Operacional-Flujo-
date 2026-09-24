import React, { useMemo } from "react";
import { saveAs } from "file-saver";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import Button from "../ui/Button";
import { getRowWarnings } from "../../services/importClientesService";

export default function ImportReviewStep({ clientRows, importing, result, onImport }) {
  const rowsWithWarnings = useMemo(
    () => clientRows.map((row, i) => ({ index: i, warnings: getRowWarnings(row) })).filter((r) => r.warnings.length > 0),
    [clientRows]
  );

  if (result) {
    const handleDownloadErrors = () => {
      const header = "fila,motivo,nombre,email,cpf\n";
      const lines = result.failedRows.map((f) =>
        [f.rowIndex + 1, f.message, f.data?.nombre, f.data?.email, f.data?.cpf].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
      );
      const blob = new Blob([header + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      saveAs(blob, "clientes_no_importados.csv");
    };

    return (
      <div className="flex flex-col gap-4 items-center text-center py-4">
        <CheckCircle2 size={36} className="text-success" />
        <p className="m-0 text-lg font-semibold text-text-primary">
          {result.insertedCount} cliente{result.insertedCount === 1 ? "" : "s"} importado{result.insertedCount === 1 ? "" : "s"}
        </p>
        {result.failedRows.length > 0 && (
          <>
            <p className="m-0 text-sm text-danger">{result.failedRows.length} fila(s) no se pudieron importar.</p>
            <Button variant="secondary" size="sm" onClick={handleDownloadErrors}>
              <Download size={16} /> Descargar filas con error (.csv)
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-text-secondary">
        Listo para importar <strong>{clientRows.length}</strong> cliente{clientRows.length === 1 ? "" : "s"}.
      </p>

      {rowsWithWarnings.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-warning-border bg-warning-bg p-3 max-h-40 overflow-y-auto">
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle size={16} /> {rowsWithWarnings.length} fila(s) con datos a revisar (no bloquean el import)
          </div>
          <ul className="m-0 pl-5 text-xs text-text-secondary list-disc">
            {rowsWithWarnings.slice(0, 10).map((r) => (
              <li key={r.index}>Fila {r.index + 1}: {r.warnings.join(", ")}</li>
            ))}
            {rowsWithWarnings.length > 10 && <li>... y {rowsWithWarnings.length - 10} más</li>}
          </ul>
        </div>
      )}

      <Button variant="primary" disabled={importing || clientRows.length === 0} onClick={onImport}>
        {importing ? <><Loader2 className="animate-spin" size={16} /> Importando...</> : `Importar ${clientRows.length} cliente${clientRows.length === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
