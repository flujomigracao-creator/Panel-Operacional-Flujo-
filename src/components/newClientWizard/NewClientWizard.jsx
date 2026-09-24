import React, { useMemo, useState, useRef } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import StepIndicator from "./StepIndicator";
import StepPersonalData from "./StepPersonalData";
import StepDocumentsAddress from "./StepDocumentsAddress";
import StepTramite from "./StepTramite";
import { analyzeDocumentImage } from "../../services/aiService";
import { uploadDocument } from "../../services/storageService";
import { createCliente, updateCliente } from "../../services/clientesService";
import { createEntrada, getCatalogoTramites, getOperarios } from "../../services/tramitesService";
import { getPipelines, getPipelineStages } from "../../services/pipelineService";

const STEP_LABELS = ["Datos personales", "Documentos", "Operación"];

const initialFormData = {
  nombres: "",
  apellidos: "",
  id_kommo: "",
  cpf: "",
  carnet_identidad: "",
  telefono: "",
  email: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  ponto_referencia: "",
};

const requiredFields = ["nombres", "apellidos"];

const validateField = (name, value) => {
  const clean = String(value || "").trim();
  if (requiredFields.includes(name) && !clean) return "Campo obligatorio";
  if (name === "email" && clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return "Email inválido";
  if (name === "cpf" && clean && clean.replace(/\D/g, "").length < 11) return "CPF incompleto";
  return "";
};

/**
 * mode="full": wizard de 3 pasos (datos → documentos/dirección → trámite), usado desde el alta principal.
 * mode="quick": un solo paso con los datos esenciales, usado desde el flujo de "crear y relacionar" en ClientView.
 */
export default function NewClientWizard({ onClose, onClientCreated, mode = "full", pipelineId, stageId }) {
  const quick = mode === "quick";

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(initialFormData);
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [clientId, setClientId] = useState(null);

  const [cepLoading, setCepLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef(null);

  const [tramiteData, setTramiteData] = useState({ servicio: "", operario: "" });
  const [catalogoTramites, setCatalogoTramites] = useState([]);
  const [operariosList, setOperariosList] = useState([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);

  const errors = useMemo(() => {
    return Object.keys(formData).reduce((acc, key) => {
      const error = validateField(key, formData[key]);
      if (error) acc[key] = error;
      return acc;
    }, {});
  }, [formData]);

  const fullName = `${formData.nombres.trim()} ${formData.apellidos.trim()}`.trim().toUpperCase();
  const canSubmitStep1 = requiredFields.every((field) => !errors[field]) && !errors.email && !errors.cpf;
  const visibleError = (field) => (touched[field] ? errors[field] : "");

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrorMessage("");
  };

  const updateTramiteField = (field, value) => {
    setTramiteData((prev) => ({ ...prev, [field]: value }));
  };

  const markAllTouched = () => {
    setTouched(Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
  };

  const handleCepSearch = async (cepValue) => {
    const cleanCep = cepValue.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData((prev) => ({
          ...prev,
          endereco: data.logradouro || prev.endereco,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));
      }
    } catch (err) {
      console.error("Error fetching CEP:", err);
      setErrorMessage("No se pudo consultar el CEP. Podés completar la dirección manualmente.");
    } finally {
      setCepLoading(false);
    }
  };

  const handleCepChange = (value) => {
    updateField("cep", value);
    const cleanNumbers = value.replace(/\D/g, "");
    if (cleanNumbers.length === 8) handleCepSearch(cleanNumbers);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsExtracting(true);
    const toastId = toast.loading("Analizando documento con IA...");

    try {
      let fileOrBase64 = file;
      if (file.type === "application/pdf") {
        const { convertPdfPageToImageBase64 } = await import("../../services/pdfToImage");
        ({ base64: fileOrBase64 } = await convertPdfPageToImageBase64(file));
      }

      const aiData = await analyzeDocumentImage(fileOrBase64);

      if (aiData && Object.keys(aiData).length > 0) {
        let nuevosNombres = formData.nombres;
        let nuevosApellidos = formData.apellidos;

        if (aiData.NOMBRE_COMPLETO) {
          const parts = aiData.NOMBRE_COMPLETO.split(" ");
          if (parts.length > 2) {
            nuevosNombres = parts.slice(0, parts.length - 2).join(" ");
            nuevosApellidos = parts.slice(parts.length - 2).join(" ");
          } else if (parts.length === 2) {
            nuevosNombres = parts[0];
            nuevosApellidos = parts[1];
          } else {
            nuevosNombres = parts[0];
          }
        }

        setFormData((prev) => ({
          ...prev,
          nombres: nuevosNombres || prev.nombres,
          apellidos: nuevosApellidos || prev.apellidos,
          cpf: aiData.CPF || prev.cpf,
          carnet_identidad: aiData.CARNET_IDENTIDAD || prev.carnet_identidad,
        }));

        toast.success("¡Datos autocompletados con éxito!", { id: toastId });
      } else {
        toast.error("No se pudo extraer información útil.", { id: toastId });
      }
    } catch (err) {
      console.error("Error analizando documento:", err);
      toast.error("Error al procesar el documento.", { id: toastId });
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // carnet_identidad ya no es una columna real de `clientes` — vive en el
  // JSONB campos_personalizados (mismo esquema que el resto de los campos
  // migratorios). Se manda solo si tiene valor para no pisar otros campos
  // que ya pudiera tener guardados el cliente.
  const buildClientPayload = () => ({
    id_kommo: formData.id_kommo || null,
    nombre: fullName,
    cpf: formData.cpf,
    telefono: formData.telefono,
    email: formData.email.toLowerCase(),
    estado_cliente: "nuevo",
    ...(formData.carnet_identidad ? { campos_personalizados: { carnet_identidad: formData.carnet_identidad } } : {}),
  });

  const handleCreateClient = async () => {
    markAllTouched();
    if (!canSubmitStep1) {
      setErrorMessage("Revisá los campos marcados antes de continuar.");
      return null;
    }
    setLoading(true);
    setErrorMessage("");
    const toastId = toast.loading("Creando cliente...");
    try {
      const client = await createCliente(buildClientPayload());
      setClientId(client.id);
      toast.success(quick ? "Cliente creado" : "Cliente creado. Sigamos con los documentos.", { id: toastId });
      return client;
    } catch (err) {
      console.error("Error creating client:", err);
      toast.error("No se pudo crear el cliente. Intentá nuevamente.", { id: toastId });
      setErrorMessage("No se pudo crear el cliente. Intentá nuevamente.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSubmit = async (event) => {
    event.preventDefault();
    const client = await handleCreateClient();
    if (client) onClientCreated(client);
  };

  const handleStep1Next = async (event) => {
    event.preventDefault();
    const client = await handleCreateClient();
    if (!client) return;

    setLoadingCatalogo(true);
    try {
      const [catalogo, operarios] = await Promise.all([getCatalogoTramites(), getOperarios()]);
      setCatalogoTramites(catalogo);
      setOperariosList(operarios);
    } catch (err) {
      console.error("Error loading catálogo de trámites:", err);
    } finally {
      setLoadingCatalogo(false);
    }

    setStep(2);
  };

  const handleStep2Next = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      if (uploadedFile && clientId) {
        const toastId = toast.loading("Guardando documento...");
        try {
          await uploadDocument(uploadedFile, clientId);
          toast.success("Documento guardado", { id: toastId });
        } catch (uploadErr) {
          console.error("Error uploading document:", uploadErr);
          toast.error("No se pudo guardar el documento, pero podés seguir.", { id: toastId });
        }
      }

      await updateCliente(clientId, {
        ...buildClientPayload(),
        direccion: JSON.stringify({
          cep: formData.cep,
          endereco: formData.endereco,
          numero: formData.numero,
          complemento: formData.complemento,
          bairro: formData.bairro,
          cidade: formData.cidade,
          estado: formData.estado,
          ponto_referencia: formData.ponto_referencia,
        }),
      });
      setStep(3);
    } catch (err) {
      console.error("Error saving address/documents:", err);
      setErrorMessage("No se pudo guardar la dirección. Podés continuar e intentar más tarde.");
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  const resolveDefaultStage = async () => {
    if (pipelineId && stageId) return { pipeline_id: pipelineId, stage_id: stageId };
    try {
      const pipelines = await getPipelines();
      const target = pipelines.find((p) => p.es_predeterminado) || pipelines[0];
      if (!target) return {};
      const targetStages = await getPipelineStages(target.id);
      return { pipeline_id: target.id, stage_id: targetStages[0]?.id };
    } catch (err) {
      console.error("Error resolving default pipeline stage:", err);
      return {};
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      if (tramiteData.servicio.trim()) {
        const { pipeline_id, stage_id } = await resolveDefaultStage();
        const newEntrada = await createEntrada({
          id_cliente: clientId,
          servicio: tramiteData.servicio,
          operario: tramiteData.operario,
          pipeline_id,
          stage_id,
        });

      }
      toast.success("Cliente listo 🎉");
      onClientCreated({ id: clientId, nombre: fullName });
    } catch (err) {
      console.error("Error creating trámite:", err);
      toast.error("El cliente se guardó, pero no se pudo crear la operación.");
      onClientCreated({ id: clientId, nombre: fullName });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    if (clientId && step > 1) {
      toast("Cliente guardado. Podés continuar más tarde desde su ficha.", { icon: "💾" });
    }
    onClose();
  };

  if (quick) {
    return (
      <Modal
        isOpen
        onClose={loading ? undefined : onClose}
        title="Nuevo cliente"
        ariaLabel="Formulario rápido para crear y relacionar cliente"
        maxWidth={520}
        footer={(
          <>
            <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={loading || !canSubmitStep1} form="new-client-quick-form">
              {loading ? <><Loader2 className="animate-spin" size={16} /> Guardando...</> : "Crear y relacionar"}
            </Button>
          </>
        )}
      >
        <form id="new-client-quick-form" onSubmit={handleQuickSubmit} className="flex flex-col gap-4">
          {errorMessage && <ErrorBanner message={errorMessage} />}
          <StepPersonalData formData={formData} updateField={updateField} visibleError={visibleError} quick />
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Nuevo cliente"
      ariaLabel="Asistente para crear nuevo cliente"
      maxWidth={720}
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <StepIndicator steps={STEP_LABELS} currentStep={step} />
          <div className="flex gap-2">
            {step > 1 && step < 3 && (
              <Button variant="ghost" onClick={handleClose} disabled={loading}>Cancelar</Button>
            )}
            {step === 1 && <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>}
            {step === 1 && (
              <Button type="submit" variant="primary" disabled={loading} form="wizard-step-1">
                {loading ? <><Loader2 className="animate-spin" size={16} /> Creando...</> : "Siguiente"}
              </Button>
            )}
            {step === 2 && (
              <Button variant="primary" onClick={handleStep2Next} disabled={loading}>
                {loading ? <><Loader2 className="animate-spin" size={16} /> Guardando...</> : "Siguiente"}
              </Button>
            )}
            {step === 3 && (
              <Button variant="primary" onClick={handleFinish} disabled={loading}>
                {loading ? <><Loader2 className="animate-spin" size={16} /> Finalizando...</> : (
                  <><CheckCircle2 size={16} /> Finalizar</>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        {errorMessage && <ErrorBanner message={errorMessage} />}

        {step === 1 && (
          <form id="wizard-step-1" onSubmit={handleStep1Next}>
            <StepPersonalData formData={formData} updateField={updateField} visibleError={visibleError} />
          </form>
        )}

        {step === 2 && (
          <StepDocumentsAddress
            formData={formData}
            updateField={updateField}
            visibleError={visibleError}
            handleCepChange={handleCepChange}
            handleCepSearch={handleCepSearch}
            cepLoading={cepLoading}
            uploadedFile={uploadedFile}
            isExtracting={isExtracting}
            fileInputRef={fileInputRef}
            handleFileUpload={handleFileUpload}
          />
        )}

        {step === 3 && (
          <StepTramite
            tramiteData={tramiteData}
            updateTramiteField={updateTramiteField}
            catalogoTramites={catalogoTramites}
            operariosList={operariosList}
            loadingCatalogo={loadingCatalogo}
          />
        )}
      </div>
    </Modal>
  );
}

function ErrorBanner({ message }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2.5 text-sm text-danger">
      <AlertTriangle size={16} /> {message}
    </div>
  );
}
