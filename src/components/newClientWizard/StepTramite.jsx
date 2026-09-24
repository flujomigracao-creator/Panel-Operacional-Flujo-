import React from "react";
import { FileText } from "lucide-react";
import Input from "../ui/Input";
import Select from "../ui/Select";
import FormField from "./FormField";

export default function StepTramite({ tramiteData, updateTramiteField, catalogoTramites, operariosList, loadingCatalogo }) {
  const servicioOptions = [
    { value: "", label: loadingCatalogo ? "Cargando..." : "Seleccionar..." },
    ...catalogoTramites.map((cat) => ({ value: cat.nombre, label: cat.nombre })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-brand-primary">
        <FileText size={18} />
        <h3 className="m-0 [font:var(--font-page-title)]">Tipo de operación</h3>
      </div>
      <p className="m-0 text-xs text-text-muted">
        Este paso crea la operación inicial del cliente para que aparezca en el pipeline. Podés omitirlo y agregarlo después desde la ficha del cliente.
      </p>

      <FormField label="Servicio / tipo de operación" name="servicio">
        <Select
          id="wizard-servicio"
          options={servicioOptions}
          value={tramiteData.servicio}
          onChange={(event) => updateTramiteField('servicio', event.target.value)}
        />
      </FormField>

      <FormField label="Operario / responsable (opcional)" name="operario">
        <Input
          id="wizard-operario"
          list="wizard-operarios-list"
          placeholder="Seleccioná o escribí el nombre"
          value={tramiteData.operario}
          onChange={(event) => updateTramiteField('operario', event.target.value)}
        />
        <datalist id="wizard-operarios-list">
          {operariosList.map((op) => (
            <option key={op.id} value={op.nombre} />
          ))}
        </datalist>
      </FormField>
    </div>
  );
}
