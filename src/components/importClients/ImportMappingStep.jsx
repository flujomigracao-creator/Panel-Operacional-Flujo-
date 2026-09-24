import React, { useMemo } from "react";
import Select from "../ui/Select";
import { hasNameMapping } from "../../services/importClientesService";

const GROUP_LABELS = {
  fijo: "Datos personales",
  direccion: "Dirección",
};

export default function ImportMappingStep({ headers, rows, targetFields, mapping, onChangeMapping }) {
  const groups = useMemo(() => {
    const byGroup = {};
    targetFields.forEach((f) => {
      if (!byGroup[f.group]) byGroup[f.group] = [];
      byGroup[f.group].push({ value: f.key, label: f.label });
    });
    return Object.entries(byGroup).map(([group, options]) => ({ label: GROUP_LABELS[group] || group, options }));
  }, [targetFields]);

  const previewRows = rows.slice(0, 5);
  const missingName = !hasNameMapping(mapping);

  const handleSelectChange = (header, value) => {
    onChangeMapping(header, value || null);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-text-secondary">
        Elegí a qué campo corresponde cada columna detectada. Las columnas que no mapees se ignoran.
      </p>

      <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
        {headers.map((header) => (
          <div key={header} className="flex flex-col gap-2 rounded-md border border-border bg-bg-elevated p-2.5">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{header}</div>
                <div className="text-xs text-text-muted truncate">
                  Ej: {(rows.slice(0, 2).map((r) => r[header]).filter(Boolean).join(" · ")) || "—"}
                </div>
              </div>
              <div className="w-56 shrink-0">
                <Select
                  groups={groups}
                  placeholder="Ignorar columna"
                  value={mapping[header] || ""}
                  onChange={(e) => handleSelectChange(header, e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {missingName && (
        <p className="m-0 text-xs text-danger">
          Falta mapear el nombre del cliente: elegí "Nombre completo" si tu archivo trae el nombre en una sola columna, o "Nombres" si lo tenés separado.
        </p>
      )}

      <div>
        <h3 className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Vista previa ({previewRows.length} de {rows.length} filas)
        </h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-bg-elevated text-left text-xs uppercase tracking-wide text-text-secondary">
                {targetFields.filter((f) => Object.values(mapping).includes(f.key)).map((f) => (
                  <th key={f.key} className="p-2 font-medium whitespace-nowrap">{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {targetFields.filter((f) => Object.values(mapping).includes(f.key)).map((f) => {
                    const header = Object.keys(mapping).find((h) => mapping[h] === f.key);
                    return <td key={f.key} className="p-2 whitespace-nowrap text-text-secondary">{header ? row[header] : ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
