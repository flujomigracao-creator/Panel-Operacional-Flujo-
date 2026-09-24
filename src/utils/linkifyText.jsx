import React from 'react';

// Detecta URLs sueltas dentro de un texto (ej. un link al formulario online
// de un trámite) y las vuelve clickeables; el resto del texto se muestra
// igual. La puntuación final (. , ; : ! ?) pegada a la URL se deja fuera del
// link para no romper el destino con un punto de cierre de oración.
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const TRAILING_PUNCT_REGEX = /[.,;:!?)\]}'"]+$/;

export function linkifyText(text) {
  if (!text) return null;
  return text.split(URL_REGEX).map((part, i) => {
    if (i % 2 === 0) return part;
    const trailingMatch = part.match(TRAILING_PUNCT_REGEX);
    const trailing = trailingMatch ? trailingMatch[0] : '';
    const url = trailing ? part.slice(0, -trailing.length) : part;
    return (
      <React.Fragment key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-brand-primary underline hover:text-brand-primary/80"
        >
          {url}
        </a>
        {trailing}
      </React.Fragment>
    );
  });
}

export function hasUrl(text) {
  URL_REGEX.lastIndex = 0;
  return !!text && URL_REGEX.test(text);
}
