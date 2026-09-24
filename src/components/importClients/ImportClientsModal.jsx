import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import StepIndicator from "../newClientWizard/StepIndicator";
import ImportSourceStep from "./ImportSourceStep";
import ImportMappingStep from "./ImportMappingStep";
import ImportReviewStep from "./ImportReviewStep";
import {
  getImportTargetFields,
  guessColumnMapping,
  buildClientRow,
  bulkCreateClientes,
  hasNameMapping,
} from "../../services/importClientesService";

const STEP_LABELS = ["Origen", "Mapeo", "Importar"];

export default function ImportClientsModal({ onClose, onImportComplete }) {
  const [step, setStep] = useState(1);
  const [targetFields, setTargetFields] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    getImportTargetFields().then(setTargetFields).catch((err) => {
      console.error("Error loading import target fields:", err);
      toast.error("No se pudieron cargar los campos disponibles.");
    });
  }, []);

  const handleParsed = ({ headers: parsedHeaders, rows: parsedRows }) => {
    setHeaders(parsedHeaders);
    setRows(parsedRows);
    setMapping(guessColumnMapping(parsedHeaders, targetFields));
    setStep(2);
  };

  const canGoToReview = useMemo(() => hasNameMapping(mapping), [mapping]);

  const clientRows = useMemo(
    () => rows.map((row) => buildClientRow(row, mapping, targetFields)),
    [rows, mapping, targetFields]
  );

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await bulkCreateClientes(clientRows);
      setResult(res);
      if (res.insertedCount > 0) {
        toast.success(`${res.insertedCount} cliente(s) importado(s)`);
        onImportComplete?.();
      }
      if (res.failedRows.length > 0 && res.insertedCount === 0) {
        toast.error("No se pudo importar ninguna fila.");
      }
    } catch (err) {
      console.error("Error en import masivo de clientes:", err);
      toast.error("Ocurrió un error al importar. Intentá nuevamente.");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (importing) return;
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Importar clientes"
      ariaLabel="Asistente para importar clientes desde CSV, Excel o Google Sheets"
      maxWidth={720}
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <StepIndicator steps={STEP_LABELS} currentStep={step} />
          <div className="flex gap-2">
            {!result && <Button variant="ghost" onClick={handleClose} disabled={importing}>Cancelar</Button>}
            {step === 2 && (
              <Button variant="primary" disabled={!canGoToReview} onClick={() => setStep(3)}>
                Siguiente
              </Button>
            )}
            {result && <Button variant="primary" onClick={handleClose}>Cerrar</Button>}
          </div>
        </div>
      )}
    >
      {step === 1 && <ImportSourceStep onParsed={handleParsed} />}

      {step === 2 && (
        <ImportMappingStep
          headers={headers}
          rows={rows}
          targetFields={targetFields}
          mapping={mapping}
          onChangeMapping={(header, fieldKey) => setMapping((prev) => ({ ...prev, [header]: fieldKey }))}
        />
      )}

      {step === 3 && (
        <ImportReviewStep
          clientRows={clientRows}
          importing={importing}
          result={result}
          onImport={handleImport}
        />
      )}
    </Modal>
  );
}
