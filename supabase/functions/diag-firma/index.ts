import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { decodeBase64, encodeBase64 } from "jsr:@std/encoding@1/base64";

Deno.serve(async (req) => {
  const raw = await req.text();
  const body = JSON.parse(raw);
  const bytes = decodeBase64(body.b64);
  return new Response(JSON.stringify({
    rawBodyLen: raw.length,
    receivedB64Len: body.b64.length,
    decodedLen: bytes.length,
    echoB64: encodeBase64(bytes),
  }), { headers: { 'Content-Type': 'application/json' } });
});
