// Tramitador CPF: llena la Declaração de Condição Fiscal oficial (PDF con campos)
// con los datos del caso. Si el caso trae foto de firma, la estampa; si no, deja la
// celda de firma en blanco para que el operador la firme a mano después de imprimir.
// Solo la llama n8n con la service key; nunca el navegador. n8n manda la plantilla
// (desde Drive) y la firma en base64 si existe; esta función no guarda nada.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import jpeg from "npm:jpeg-js@0.4.4";
import { PNG } from "npm:pngjs@7.0.0";
import { Buffer } from "node:buffer";
import { encodeBase64, decodeBase64 } from "jsr:@std/encoding@1/base64";

// Celda de la firma: debajo de la cabecera "Assinatura" (y 256–264), a la misma altura que
// el valor de "Local e Data" (y 234–255). Coordenadas PDF, origen abajo-izquierda.
const FIRMA_CELDA = { x: 90, y: 230, w: 210, h: 30 };
const REQUERIDOS = ["Nome_Completo", "Data_Nascimento", "Nacionalidade", "Nome_Pai", "Nome_Mae", "Endereco_Brasil", "Cidade"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function esServiceRole(req: Request) {
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function fecha(v: string) {
  const s = String(v || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (br) return `${br[1].padStart(2, "0")}/${br[2].padStart(2, "0")}/${br[3]}`;
  return s;
}

function hoySaoPaulo() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

function esNoResidente(condicao: string) {
  return /n[aã]o|non|no[ _-]?resid/i.test(condicao || "");
}

function decodificar(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const p = PNG.sync.read(Buffer.from(bytes));
    return { width: p.width, height: p.height, data: p.data as Uint8Array };
  }
  return jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
}

// Foto de la firma (papel claro + tinta) -> tinta azul sobre fondo transparente, recortada al trazo,
// para que se integre a la hoja como una firma hecha sobre el papel. Puede fallar con fotos poco
// comunes (perfil de color raro, formato atípico); en ese caso el llamador cae a incrustarla tal cual.
function firmaTransparente(bytes: Uint8Array): Uint8Array {
  const src = decodificar(bytes);
  let papel = 0, n = 0;
  for (let i = 0; i < src.data.length; i += 4 * 7) {
    const l = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    if (l > 120) { papel += l; n++; }
  }
  papel = n ? papel / n : 230;
  const out = new PNG({ width: src.width, height: src.height });
  let minX = src.width, minY = src.height, maxX = -1, maxY = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      const lum = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
      const a = Math.max(0, Math.min(255, Math.round((papel - 35 - lum) * 3)));
      out.data[i] = 20; out.data[i + 1] = 40; out.data[i + 2] = 130; out.data[i + 3] = a;
      if (a > 60) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  if (maxX < 0) throw new Error("firma_vacia");
  const pad = 3, cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad);
  const cw = Math.min(src.width - cx, maxX - minX + 1 + 2 * pad), ch = Math.min(src.height - cy, maxY - minY + 1 + 2 * pad);
  const crop = new PNG({ width: cw, height: ch });
  PNG.bitblt(out, crop, cx, cy, cw, ch, 0, 0);
  return new Uint8Array(PNG.sync.write(crop));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
  if (!esServiceRole(req)) return json({ ok: false, erro: "no_autorizado" }, 403);

  let body: { datos?: Record<string, string>; firma?: { base64: string; mime?: string }; plantilla_base64?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, erro: "json_invalido" }, 400);
  }
  const d = body.datos || {};
  const faltantes = REQUERIDOS.filter((k) => !String(d[k] || "").trim());
  // La firma es opcional: si no viene, la declaración sale con la celda en blanco
  // y el operador la firma a mano después de imprimirla.
  if (!body.plantilla_base64) faltantes.push("PLANTILLA");
  if (faltantes.length) return json({ ok: false, erro: "faltan_datos", faltantes });

  let pdf;
  try {
    pdf = await PDFDocument.load(decodeBase64(body.plantilla_base64!));
  } catch {
    return json({ ok: false, erro: "plantilla_invalida" });
  }
  const form = pdf.getForm();
  const cidade = String(d.Cidade).trim();
  const endereco = String(d.Endereco_Brasil).trim();
  const enderecoCompleto = [endereco, endereco.toLowerCase().includes(cidade.toLowerCase()) ? "" : cidade, /brasil|brazil/i.test(endereco) ? "" : "Brasil"]
    .filter(Boolean).join(", ");

  const valores: Record<string, string> = {
    "nome completo": String(d.Nome_Completo).trim().toUpperCase(),
    "data de nascimento": fecha(d.Data_Nascimento),
    "nacionalidade": String(d.Nacionalidade).trim(),
    "nome do pai": String(d.Nome_Pai).trim().toUpperCase(),
    "nome da mãe": String(d.Nome_Mae).trim().toUpperCase(),
    "endereço completo rua número município  local país": enderecoCompleto,
    "Local e Data": `${cidade}, ${hoySaoPaulo()}`,
  };
  try {
    for (const [campo, valor] of Object.entries(valores)) form.getTextField(campo).setText(valor);
    form.getRadioGroup("Condição").select(esNoResidente(d.Condicao) ? "não-residente" : "residente");
    form.flatten();
  } catch (e) {
    return json({ ok: false, erro: "plantilla_sin_campos", detalle: String(e) });
  }

  let modoFirma = "sin_firma";
  if (body.firma?.base64) {
    const firmaBytes = decodeBase64(body.firma.base64);
    const mimeFirma = (body.firma.mime || "").toLowerCase();
    let img;
    modoFirma = "transparente";
    try {
      img = await pdf.embedPng(firmaTransparente(firmaBytes));
    } catch (eTransparencia) {
      // Respaldo: si el procesado con transparencia falla (foto atípica), se incrusta la
      // firma tal cual sobre fondo blanco — sigue siendo una firma válida, solo menos prolija.
      modoFirma = "opaca_respaldo";
      try {
        const esPng = mimeFirma.includes("png") || (firmaBytes[0] === 0x89 && firmaBytes[1] === 0x50);
        img = esPng ? await pdf.embedPng(firmaBytes) : await pdf.embedJpg(firmaBytes);
      } catch (eDirecta) {
        return json({ ok: false, erro: "firma_no_procesable", detalle: String(eTransparencia) + " | respaldo: " + String(eDirecta), mime: mimeFirma });
      }
    }
    const escala = Math.min(FIRMA_CELDA.w / img.width, FIRMA_CELDA.h / img.height);
    const w = img.width * escala, h = img.height * escala;
    pdf.getPage(0).drawImage(img, { x: FIRMA_CELDA.x, y: FIRMA_CELDA.y + (FIRMA_CELDA.h - h) / 2, width: w, height: h });
  }

  const out = await pdf.save();
  return json({
    ok: true,
    pdf_base64: encodeBase64(out),
    condicao: esNoResidente(d.Condicao) ? "não-residente" : "residente",
    valores,
    modo_firma: modoFirma,
  });
});
