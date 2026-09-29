import React, { useState } from 'react';
import ClientDetailView from '@features/clients/components/ClientDetailView';
import Contact360 from './Contact360';

// Ficha del contacto: por defecto la vista 360°; "Vista detallada" abre la ficha completa de siempre
// (edición de campos, subida y revisión de documentos, Drive, relaciones, conversación).
export default function ContactView({ clientId, onBack, onNavigateToClient, onOpenChat, onOpenTramite }) {
  const [detailed, setDetailed] = useState(false);
  if (detailed) {
    return <ClientDetailView clientId={clientId} onBack={() => setDetailed(false)} onNavigateToClient={onNavigateToClient} onOpenChat={onOpenChat} />;
  }
  return <Contact360 clientId={clientId} onBack={onBack} onOpenChat={onOpenChat} onOpenTramite={onOpenTramite} onDetailed={() => setDetailed(true)} />;
}
