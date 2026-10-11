import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { firmarRutas } from '../services/publicacionesService';
import {
  FORMATOS, MAX_LAMINAS, laminasDe, laminaVacia, esInvitacion, conInvitacionFinal, editarLamina, agregarLamina, quitarLamina, olvidarImagenLamina,
  imagenesFaltantes, rutasDeImagenes, textoParaInstagram,
} from '../publicaciones';

const CAMPO = 'rounded border border-border bg-bg-surface px-2 py-1 text-text-primary disabled:opacity-70';

function Miniatura({ url, vacia }) {
  if (url) return <img src={url} alt="Vista previa de la imagen de Instagram" className="aspect-square w-24 shrink-0 rounded border border-border object-cover" />;
  return (
    <div className="flex aspect-square w-24 shrink-0 items-center justify-center rounded border border-dashed border-border px-1 text-center text-[10px] text-text-muted">
      {vacia}
    </div>
  );
}

// Contenido propio de Instagram: texto, formato (imagen única o carrusel con portada del país) y vista previa de las imágenes.
export default function InstagramEditor({ p, editable, ocupada, guardar, textoFb }) {
  const [igTexto, setIgTexto] = useState(p.ig_texto || '');
  const [igTitular, setIgTitular] = useState(p.ig_titular || '');
  const [igIdea, setIgIdea] = useState(p.ig_imagen_idea || '');
  const [pais, setPais] = useState(p.ig_pais || '');
  const [grupo, setGrupo] = useState(p.ig_grupo || '');
  const [laminas, setLaminas] = useState(laminasDe(p));

  const carrusel = p.ig_formato === 'carrusel';
  const bloqueado = !editable || ocupada;
  const faltan = imagenesFaltantes(p);
  const rutas = rutasDeImagenes(p);
  const urls = useQuery({ queryKey: ['publicaciones-img', p.id, rutas.join('|')], queryFn: () => firmarRutas(rutas), enabled: rutas.length > 0, staleTime: 30 * 60 * 1000 });
  const url = (ruta) => (ruta ? urls.data?.[ruta] : undefined);

  const guardarCampo = (campo, valor, original) => {
    const limpio = valor.trim() || null;
    if (limpio === (original || null)) return;
    guardar({ [campo]: limpio }, 'Guardado');
  };

  const guardarLaminas = (nuevas, ok, extra = {}) => {
    setLaminas(nuevas);
    guardar({ ig_slides: nuevas, ...extra }, ok);
  };

  const cambiarFormato = (f) => {
    if (f === p.ig_formato) return;
    const parche = { ig_formato: f };
    if (f === 'carrusel' && laminas.length === 0) {
      const base = conInvitacionFinal([laminaVacia()]);
      setLaminas(base);
      parche.ig_slides = base;
    }
    guardar(parche, 'Formato cambiado');
  };

  const editar = (i, campo, valor) => setLaminas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)));
  const confirmarLamina = (i, campo) => {
    const nuevas = editarLamina(laminasDe(p), i, campo, (laminas[i]?.[campo] || '').trim());
    if (nuevas === laminasDe(p)) return;
    guardarLaminas(nuevas, 'Lámina guardada (su imagen se regenerará)');
  };

  const pedirImagenes = () => guardar({ ig_generar: true }, 'Pedido: las imágenes aparecerán en unos minutos');
  const regenerarLamina = (i) => guardarLaminas(olvidarImagenLamina(laminasDe(p), i), 'Se regenerará esa lámina', { ig_generar: true });
  const regenerarUnica = () => guardar({ ig_imagen_path: null, ig_generar: true }, 'Se generará una imagen nueva');

  return (
    <div className="flex flex-col gap-3 rounded border border-border bg-bg-base px-3 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-text-primary">Instagram (contenido propio)</p>
        <label className="ml-auto flex items-center gap-2 text-text-secondary" htmlFor={`igformato-${p.id}`}>
          Formato
          <select id={`igformato-${p.id}`} value={p.ig_formato || 'imagen'} disabled={bloqueado} onChange={(e) => cambiarFormato(e.target.value)} className={CAMPO}>
            {Object.entries(FORMATOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      <label className="grid gap-1 text-text-secondary" htmlFor={`igtexto-${p.id}`}>
        Texto para Instagram (si lo dejas vacío se usa el de Facebook)
        <textarea id={`igtexto-${p.id}`} value={igTexto} disabled={bloqueado} rows={Math.min(12, Math.max(3, igTexto.split('\n').length + 1))}
          onChange={(e) => setIgTexto(e.target.value)} onBlur={() => guardarCampo('ig_texto', igTexto, p.ig_texto)}
          placeholder="Empieza con un gancho en la primera línea: es lo único que se ve antes de «más»."
          className={`w-full resize-y px-3 py-2 text-sm ${CAMPO}`} />
      </label>

      {!carrusel && (
        <div className="flex flex-wrap items-start gap-3">
          <Miniatura url={url(p.ig_imagen_path)} vacia="Sin imagen todavía" />
          <div className="grid min-w-[220px] flex-1 gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-text-secondary" htmlFor={`igtitular-${p.id}`}>
              Titular dentro de la imagen (máx. 40, opcional)
              <input id={`igtitular-${p.id}`} value={igTitular} maxLength={40} disabled={bloqueado}
                onChange={(e) => setIgTitular(e.target.value)} onBlur={() => guardarCampo('ig_titular', igTitular, p.ig_titular)} className={CAMPO} />
            </label>
            <label className="grid gap-1 text-text-secondary" htmlFor={`igidea-${p.id}`}>
              Idea de la imagen
              <input id={`igidea-${p.id}`} value={igIdea} disabled={bloqueado}
                onChange={(e) => setIgIdea(e.target.value)} onBlur={() => guardarCampo('ig_imagen_idea', igIdea, p.ig_imagen_idea)} className={CAMPO} />
            </label>
          </div>
        </div>
      )}

      {carrusel && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-text-secondary" htmlFor={`igpais-${p.id}`}>
              País de la portada (la imagen del país)
              <input id={`igpais-${p.id}`} value={pais} maxLength={40} disabled={bloqueado} placeholder="Cuba"
                onChange={(e) => setPais(e.target.value)} onBlur={() => guardarCampo('ig_pais', pais, p.ig_pais)} className={CAMPO} />
            </label>
            <label className="grid gap-1 text-text-secondary" htmlFor={`iggrupo-${p.id}`}>
              Grupo al que va dirigida
              <input id={`iggrupo-${p.id}`} value={grupo} maxLength={40} disabled={bloqueado} placeholder="cubanos"
                onChange={(e) => setGrupo(e.target.value)} onBlur={() => guardarCampo('ig_grupo', grupo, p.ig_grupo)} className={CAMPO} />
            </label>
          </div>

          <ol className="flex flex-col gap-3">
            {laminas.map((l, i) => (
              <li key={i} className="flex flex-wrap items-start gap-3 rounded border border-border bg-bg-surface p-2">
                <Miniatura url={url(laminasDe(p)[i]?.path)} vacia={i === 0 ? 'Portada sin generar' : 'Sin generar'} />
                <div className="grid min-w-[220px] flex-1 gap-2">
                  <p className="font-medium text-text-secondary">{i === 0 ? 'Lámina 1 · Portada: el país hacia el grupo' : esInvitacion(l) ? `Lámina ${i + 1} · Final: invita a seguir (texto fijo)` : `Lámina ${i + 1}`}</p>
                  <input aria-label={`Titular de la lámina ${i + 1}`} value={l.titular || ''} maxLength={40} disabled={bloqueado || esInvitacion(l)} placeholder="Titular (máx. 40)"
                    onChange={(e) => editar(i, 'titular', e.target.value)} onBlur={() => confirmarLamina(i, 'titular')} className={CAMPO} />
                  <input aria-label={`Texto de la lámina ${i + 1}`} value={l.texto || ''} maxLength={110} disabled={bloqueado || esInvitacion(l)} placeholder="Texto corto (máx. 110)"
                    onChange={(e) => editar(i, 'texto', e.target.value)} onBlur={() => confirmarLamina(i, 'texto')} className={CAMPO} />
                  <input aria-label={`Idea visual de la lámina ${i + 1}`} value={l.idea || ''} disabled={bloqueado || esInvitacion(l)} placeholder="Idea visual"
                    onChange={(e) => editar(i, 'idea', e.target.value)} onBlur={() => confirmarLamina(i, 'idea')} className={CAMPO} />
                  <div className="flex gap-2">
                    <button disabled={bloqueado} onClick={() => regenerarLamina(i)} className="rounded-md border border-border px-2 py-1 text-text-secondary hover:bg-bg-base disabled:opacity-50">Regenerar imagen</button>
                    {laminas.length > 2 && !esInvitacion(l) && (
                      <button disabled={bloqueado} onClick={() => guardarLaminas(quitarLamina(laminasDe(p), i), 'Lámina quitada')} className="rounded-md border border-border px-2 py-1 text-text-secondary hover:bg-bg-base disabled:opacity-50">Quitar</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <button disabled={bloqueado || laminas.length >= MAX_LAMINAS} onClick={() => guardarLaminas(agregarLamina(laminasDe(p)), 'Lámina añadida')}
              className="rounded-md border border-border px-3 py-1.5 text-text-secondary hover:bg-bg-base disabled:opacity-50">
              + Añadir lámina ({laminas.length}/{MAX_LAMINAS})
            </button>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button disabled={bloqueado || p.ig_generar || faltan === 0} onClick={pedirImagenes}
          className="rounded-md bg-brand-primary px-3 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {faltan === 0 ? 'Imágenes listas' : `Generar imágenes (${faltan} sin imagen)`}
        </button>
        {!carrusel && p.ig_imagen_path && (
          <button disabled={bloqueado || p.ig_generar} onClick={regenerarUnica} className="rounded-md border border-border px-3 py-1.5 text-text-secondary hover:bg-bg-base disabled:opacity-50">Regenerar imagen</button>
        )}
        {p.ig_generar && <span className="text-warning">En cola: se generan en los próximos minutos (se revisa cada 5 min).</span>}
      </div>

      <details className="text-text-muted">
        <summary className="cursor-pointer">Así saldrá el texto en Instagram</summary>
        <p className="mt-1 whitespace-pre-wrap rounded border border-border bg-bg-surface px-3 py-2 text-text-secondary">{textoParaInstagram(igTexto.trim() || textoFb)}</p>
      </details>
      <p className="text-text-muted">
        Los enlaces no se pulsan en Instagram: se cambian por «link en la bio». Las imágenes se generan aparte de las de Facebook y llevan el titular escrito;
        revísalas aquí antes de aprobar. Si una imagen falta a la hora de publicar, se genera entonces; si no se puede, no se publica y te llega una tarea.
      </p>
    </div>
  );
}
