import React from "react";
import { UserPlus } from "lucide-react";
import FormField from "./FormField";

export default function StepPersonalData({ formData, updateField, visibleError, quick = false }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-brand-primary">
        <UserPlus size={18} />
        <h3 className="m-0 [font:var(--font-page-title)]">Datos personales</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Nombres" name="nombres" required value={formData.nombres} onChange={updateField} error={visibleError('nombres')} placeholder="Ej. Juan Carlos" />
        <FormField label="Apellidos" name="apellidos" required value={formData.apellidos} onChange={updateField} error={visibleError('apellidos')} placeholder="Ej. Pérez Gómez" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="CPF" name="cpf" value={formData.cpf} onChange={updateField} error={visibleError('cpf')} placeholder="000.000.000-00" />
        <FormField label="Carnet / Identidad" name="carnet_identidad" value={formData.carnet_identidad} onChange={updateField} error={visibleError('carnet_identidad')} />
        <FormField label="Teléfono" name="telefono" value={formData.telefono} onChange={updateField} error={visibleError('telefono')} placeholder="+55 ..." />
        <FormField label="Email" name="email" type="email" value={formData.email} onChange={updateField} error={visibleError('email')} placeholder="cliente@email.com" />
      </div>

      {!quick && (
        <FormField label="ID Kommo (opcional)" name="id_kommo" value={formData.id_kommo} onChange={updateField} placeholder="Ej. 23314228" />
      )}
      {!quick && (
        <p className="m-0 text-xs text-text-muted">
          Si completás el ID Kommo, los mensajes de este lead se sincronizarán automáticamente.
        </p>
      )}
    </div>
  );
}
