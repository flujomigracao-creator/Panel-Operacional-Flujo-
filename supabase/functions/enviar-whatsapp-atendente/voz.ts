// Carácter de "hablando por un micrófono" para las notas de voz de Nora: ogg/opus -> PCM -> filtros, sala y ruido -> ogg/opus.
// Sin dependencias propias: recibe el constructor de opusscript (npm:opusscript) para poder probarse también en Node.
// Si algo falla, quien llama manda el audio original: nunca debe impedir que salga la nota de voz.

const RATE = 48000;
const FRAME = 960; // 20 ms

export type OpcionesVoz = {
  ruidoDb?: number; // nivel del ruido respecto del volumen de la voz (negativo). -34 = se nota poco, la voz sigue clara
  salaMezcla?: number; // 0..1, cuánta sala (eco corto)
  semilla?: number;
};

// ---------- Ogg ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array) => {
  let c = 0;
  for (let i = 0; i < b.length; i++) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ b[i]) & 0xff]) >>> 0;
  return c >>> 0;
};

function leerPaquetes(ogg: Uint8Array): Uint8Array[] {
  const paquetes: Uint8Array[] = [];
  let actual: number[] = [];
  let pos = 0;
  while (pos + 27 <= ogg.length) {
    if (ogg[pos] !== 0x4f || ogg[pos + 1] !== 0x67 || ogg[pos + 2] !== 0x67 || ogg[pos + 3] !== 0x53) throw new Error('ogg corrupto');
    const nseg = ogg[pos + 26];
    let dataPos = pos + 27 + nseg;
    for (let s = 0; s < nseg; s++) {
      const len = ogg[pos + 27 + s];
      for (let k = 0; k < len; k++) actual.push(ogg[dataPos + k]);
      dataPos += len;
      if (len < 255) { paquetes.push(Uint8Array.from(actual)); actual = []; }
    }
    pos = dataPos;
  }
  return paquetes;
}

function pagina(paquete: Uint8Array, granule: number, seq: number, serial: number, tipo: number): Uint8Array {
  const segs: number[] = [];
  let resto = paquete.length;
  while (resto >= 255) { segs.push(255); resto -= 255; }
  segs.push(resto);
  const out = new Uint8Array(27 + segs.length + paquete.length);
  const dv = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53, 0, tipo]);
  dv.setUint32(6, granule >>> 0, true);
  dv.setUint32(10, Math.floor(granule / 4294967296) >>> 0, true);
  dv.setUint32(14, serial, true);
  dv.setUint32(18, seq, true);
  out[26] = segs.length;
  out.set(segs, 27);
  out.set(paquete, 27 + segs.length);
  dv.setUint32(22, crc32(out), true);
  return out;
}

function escribirOgg(paquetes: Uint8Array[], muestras: number): Uint8Array {
  const serial = 0x4e4f5241;
  const cabecera = new Uint8Array(19);
  cabecera.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, 1]); // OpusHead, v1, 1 canal
  const dv = new DataView(cabecera.buffer);
  dv.setUint16(10, 312, true); // pre-skip
  dv.setUint32(12, RATE, true);
  dv.setUint16(16, 0, true);
  cabecera[18] = 0;
  const vendor = new TextEncoder().encode('flujo');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]);
  const dt = new DataView(tags.buffer);
  dt.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  dt.setUint32(12 + vendor.length, 0, true);
  const paginas: Uint8Array[] = [pagina(cabecera, 0, 0, serial, 2), pagina(tags, 0, 1, serial, 0)];
  paquetes.forEach((p, i) => {
    const ultimo = i === paquetes.length - 1;
    paginas.push(pagina(p, ultimo ? muestras + 312 : (i + 1) * FRAME + 312, i + 2, serial, ultimo ? 4 : 0));
  });
  const total = paginas.reduce((n, p) => n + p.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const p of paginas) { res.set(p, o); o += p.length; }
  return res;
}

// ---------- DSP ----------
// Biquad (cookbook de Robert Bristow-Johnson).
type Bq = { b0: number; b1: number; b2: number; a1: number; a2: number; x1: number; x2: number; y1: number; y2: number };
const bq = (b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Bq =>
  ({ b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 });
const pasaAltos = (f: number, q = 0.707): Bq => {
  const w = (2 * Math.PI * f) / RATE, c = Math.cos(w), a = Math.sin(w) / (2 * q);
  return bq((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + a, -2 * c, 1 - a);
};
const pasaBajos = (f: number, q = 0.707): Bq => {
  const w = (2 * Math.PI * f) / RATE, c = Math.cos(w), a = Math.sin(w) / (2 * q);
  return bq((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + a, -2 * c, 1 - a);
};
const pico = (f: number, db: number, q = 0.9): Bq => {
  const A = Math.pow(10, db / 40), w = (2 * Math.PI * f) / RATE, c = Math.cos(w), a = Math.sin(w) / (2 * q);
  return bq(1 + a * A, -2 * c, 1 - a * A, 1 + a / A, -2 * c, 1 - a / A);
};
const repisaGraves = (f: number, db: number): Bq => {
  const A = Math.pow(10, db / 40), w = (2 * Math.PI * f) / RATE, c = Math.cos(w), s = Math.sin(w);
  const beta = Math.sqrt(A) * s * Math.SQRT2 / 1;
  return bq(
    A * ((A + 1) - (A - 1) * c + beta), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - beta),
    (A + 1) + (A - 1) * c + beta, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - beta,
  );
};
const filtrar = (f: Bq, x: number) => {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y;
  return y;
};

function rng(semilla: number) {
  let s = semilla >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 - 0.5; };
}

// Eco de sala chica: 4 peines en paralelo + 2 pasa-todo (Schroeder).
function sala(x: Float32Array, mezcla: number): Float32Array {
  const retardos = [Math.round(RATE * 0.0297), Math.round(RATE * 0.0371), Math.round(RATE * 0.0411), Math.round(RATE * 0.0437)];
  const fb = 0.62;
  const peines = retardos.map((n) => ({ buf: new Float32Array(n), i: 0, lp: 0 }));
  const pasa = [Math.round(RATE * 0.005), Math.round(RATE * 0.0017)].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  const y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (const c of peines) {
      const sal = c.buf[c.i];
      c.lp = sal * 0.7 + c.lp * 0.3; // amortigua agudos: sala de cuarto, no de catedral
      c.buf[c.i] = x[n] + c.lp * fb;
      c.i = (c.i + 1) % c.buf.length;
      s += sal;
    }
    s *= 0.25;
    for (const a of pasa) {
      const b = a.buf[a.i];
      const v = s + b * 0.5;
      a.buf[a.i] = v;
      s = b - v * 0.5;
      a.i = (a.i + 1) % a.buf.length;
    }
    y[n] = x[n] * (1 - mezcla * 0.5) + s * mezcla;
  }
  return y;
}

function procesarPcm(entrada: Float32Array, op: OpcionesVoz): Float32Array {
  const ruidoDb = op.ruidoDb ?? -34;
  const mezclaSala = op.salaMezcla ?? 0.16;
  const rand = rng(op.semilla ?? 20261002);

  // Aire de sala antes y después de la voz, para que el ruido no aparezca y desaparezca de golpe.
  const pre = Math.round(RATE * 0.35), post = Math.round(RATE * 0.5);
  const x = new Float32Array(pre + entrada.length + post);
  x.set(entrada, pre);

  // Carácter de micrófono: recorta graves de fondo, calidez cerca del mic (efecto proximidad), presencia, agudos suaves.
  const cadena = [pasaAltos(85), repisaGraves(180, 2.5), pico(2800, 2.0, 0.9), pico(5200, 1.5, 1.0), pasaBajos(9500)];
  let v = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) { let s = x[n]; for (const f of cadena) s = filtrar(f, s); v[n] = s; }

  // Compresión suave (se ve más "grabada").
  const umbral = 0.12, ratio = 2.4, ataque = Math.exp(-1 / (RATE * 0.005)), liberar = Math.exp(-1 / (RATE * 0.12));
  let env = 0;
  for (let n = 0; n < v.length; n++) {
    const a = Math.abs(v[n]);
    env = a > env ? ataque * env + (1 - ataque) * a : liberar * env + (1 - liberar) * a;
    if (env > umbral) v[n] *= Math.pow(env / umbral, 1 / ratio - 1);
  }

  v = sala(v, mezclaSala);

  // Volumen de la voz (RMS de las partes con voz) para fijar el ruido relativo a ella.
  let suma = 0, cuenta = 0;
  for (let n = 0; n < v.length; n++) if (Math.abs(v[n]) > 0.01) { suma += v[n] * v[n]; cuenta++; }
  const rmsVoz = cuenta ? Math.sqrt(suma / cuenta) : 0.1;
  const nivelRuido = rmsVoz * Math.pow(10, ruidoDb / 20);

  // Ruido de cuarto: ruido rosa (graves más presentes) + soplido muy suave del micrófono; sin zumbido para no cansar.
  let b0 = 0, b1 = 0, b2 = 0;
  const filtroRuido = pasaBajos(7000);
  for (let n = 0; n < v.length; n++) {
    const w = rand() * 2;
    b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
    const rosa = (b0 + b1 + b2 + w * 0.1848) * 0.3;
    const soplido = rand() * 0.25;
    v[n] += filtrar(filtroRuido, rosa + soplido) * nivelRuido * 2.2;
  }

  // Normaliza al pico y deja margen.
  let pico_ = 0;
  for (let n = 0; n < v.length; n++) pico_ = Math.max(pico_, Math.abs(v[n]));
  const g = pico_ > 0 ? 0.89 / pico_ : 1;
  for (let n = 0; n < v.length; n++) v[n] *= g;
  return v;
}

// ---------- Entrada pública ----------
// OpusScript: constructor de opusscript. ogg: nota de voz mono ogg/opus (la que genera ElevenLabs con opus_48000_*).
export function procesarVoz(ogg: Uint8Array, OpusScript: any, op: OpcionesVoz = {}): Uint8Array {
  const paquetes = leerPaquetes(ogg);
  if (paquetes.length < 3 || String.fromCharCode(...paquetes[0].slice(0, 8)) !== 'OpusHead') throw new Error('no es ogg/opus');
  const decoder = new OpusScript(RATE, 1, OpusScript.Application.AUDIO);
  const trozos: Int16Array[] = [];
  let total = 0;
  for (const p of paquetes.slice(2)) {
    const pcm: Uint8Array = decoder.decode(p);
    const i16 = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    trozos.push(i16);
    total += i16.length;
  }
  if (!total) throw new Error('audio vacío');
  const pcmEntrada = new Float32Array(total);
  let o = 0;
  for (const t of trozos) for (let k = 0; k < t.length; k++) pcmEntrada[o++] = t[k] / 32768;
  decoder.delete?.();

  const salida = procesarPcm(pcmEntrada, op);

  const encoder = new OpusScript(RATE, 1, OpusScript.Application.VOIP);
  encoder.setBitrate?.(40000);
  const out: Uint8Array[] = [];
  const bytes = new Uint8Array(FRAME * 2);
  const dvb = new DataView(bytes.buffer);
  for (let pos = 0; pos < salida.length; pos += FRAME) {
    for (let k = 0; k < FRAME; k++) {
      const s = pos + k < salida.length ? salida[pos + k] : 0;
      dvb.setInt16(k * 2, Math.max(-32768, Math.min(32767, Math.round(s * 32767))), true);
    }
    out.push(Uint8Array.from(encoder.encode(bytes, FRAME)));
  }
  encoder.delete?.();
  return escribirOgg(out, salida.length);
}
