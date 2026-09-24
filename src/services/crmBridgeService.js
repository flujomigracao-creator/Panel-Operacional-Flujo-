/**
 * crmBridgeService.js
 * Antes pedía el historial de chat de Kommo vía n8n como intermediario; sin
 * n8n en esta versión, no hay forma directa de traer ese historial externo.
 * Se deja el stub para no romper a los llamantes (useClientAiChat.js) — el
 * contexto de IA sigue teniendo las notas internas del cliente.
 */

export async function getChatHistoryFromN8n(_idCrm) {
  return "Historial de CRM externo no disponible en esta versión.";
}
