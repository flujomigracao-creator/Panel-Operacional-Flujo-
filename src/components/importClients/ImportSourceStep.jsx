import React, { useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Link2, Loader2, UploadCloud } from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { parseSpreadsheetFile, parseCsvText } from "../../utils/importParsers";
import { fetchGoogleSheetCsv } from "../../services/importClientesService";

export default function ImportSourceStep({ onParsed }) {
  const [mode, setMode] = useState("file");
  const [sheetUrl, setSheetUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.rows.length === 0) throw new Error("El archivo no tiene filas de datos.");
      onParsed(parsed);
    } catch (err) {
      setError(err.message || "No se pudo leer el archivo.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLoadSheet = async () => {
    if (!sheetUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      const csv = await fetchGoogleSheetCsv(sheetUrl.trim());
      const parsed = parseCsvText(csv);
      if (parsed.rows.length === 0) throw new Error("La hoja no tiene filas de datos.");
      onParsed(parsed);
    } catch (err) {
      setError(err.message || "No se pudo cargar la hoja de Google Sheets.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-text-secondary">
        Elegí de dónde traer tu base de clientes. En el próximo paso vas a poder elegir a qué campo corresponde cada columna.
      </p>

      <div className="flex gap-2">
        <Button variant={mode === "file" ? "primary" : "secondary"} size="sm" onClick={() => { setMode("file"); setError(""); }}>
          <FileSpreadsheet size={16} /> Subir archivo
        </Button>
        <Button variant={mode === "sheet" ? "primary" : "secondary"} size="sm" onClick={() => { setMode("sheet"); setError(""); }}>
          <Link2 size={16} /> Google Sheets
        </Button>
      </div>

      {mode === "file" && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-bg-elevated p-6 items-center text-center">
          <UploadCloud size={28} className="text-brand-primary" />
          <p className="m-0 text-sm text-text-secondary">Archivos .csv, .xlsx o .xls</p>
          <input type="file" accept=".csv,.xlsx,.xls" ref={fileInputRef} className="hidden" onChange={handleFile} />
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => fileInputRef.current?.click()}>
            {loading ? <><Loader2 className="animate-spin" size={16} /> Leyendo...</> : "Seleccionar archivo"}
          </Button>
        </div>
      )}

      {mode === "sheet" && (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
            Link de Google Sheets
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <Button variant="primary" size="md" disabled={loading || !sheetUrl.trim()} onClick={handleLoadSheet}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : "Cargar"}
            </Button>
          </div>
          <p className="m-0 text-xs text-text-muted">
            La hoja debe tener acceso "Cualquier persona con el enlace puede ver".
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2.5 text-sm text-danger">
          <AlertTriangle size={16} /> {error}
        </div>
      )}
    </div>
  );
}
