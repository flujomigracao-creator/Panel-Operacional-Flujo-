import React from "react";
import { Bot, Loader2, UploadCloud, MapPin } from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import FormField from "./FormField";

export default function StepDocumentsAddress({
  formData,
  updateField,
  visibleError,
  handleCepChange,
  handleCepSearch,
  cepLoading,
  uploadedFile,
  isExtracting,
  fileInputRef,
  handleFileUpload,
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-bg-elevated p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-text-primary">
            <Bot size={20} className="text-brand-primary" />
            <span className="font-medium">Autocompletado con IA</span>
          </div>
          <input
            type="file"
            accept="image/*,application/pdf"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={isExtracting}
            onClick={() => fileInputRef.current?.click()}
          >
            {isExtracting ? (
              <><Loader2 className="animate-spin" size={16} /> Procesando...</>
            ) : (
              <><UploadCloud size={16} /> {uploadedFile ? 'Cambiar documento' : 'Subir documento'}</>
            )}
          </Button>
        </div>
        <p className="m-0 text-[0.8rem] text-text-secondary">
          {uploadedFile
            ? `📄 Adjunto: ${uploadedFile.name}`
            : 'Subí un pasaporte, carnet de identidad o documento brasileño (JPG, PNG o PDF) para autocompletar los campos.'}
        </p>
        <p className="m-0 text-xs text-text-muted">Este paso es opcional — podés continuar sin subir nada.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-brand-primary">
          <MapPin size={18} />
          <h3 className="m-0 [font:var(--font-page-title)]">Dirección (opcional)</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="CEP" name="cep" error={visibleError('cep')}>
            <div className="flex items-center gap-2">
              <Input
                id="wizard-cep"
                value={formData.cep}
                onChange={(event) => handleCepChange(event.target.value)}
                onBlur={(event) => handleCepSearch(event.target.value)}
                error={Boolean(visibleError('cep'))}
                placeholder="00000-000"
              />
              {cepLoading && <Loader2 className="animate-spin text-brand-primary" size={18} />}
            </div>
          </FormField>
          <FormField label="Estado" name="estado" value={formData.estado} onChange={updateField} />
          <FormField label="Ciudad" name="cidade" value={formData.cidade} onChange={updateField} />
          <FormField label="Bairro" name="bairro" value={formData.bairro} onChange={updateField} />
          <FormField label="Endereço / Calle" name="endereco" value={formData.endereco} onChange={updateField} />
          <FormField label="Número" name="numero" value={formData.numero} onChange={updateField} />
          <FormField label="Complemento" name="complemento" value={formData.complemento} onChange={updateField} />
          <FormField label="Punto de referencia" name="ponto_referencia" value={formData.ponto_referencia} onChange={updateField} />
        </div>
      </div>
    </div>
  );
}
