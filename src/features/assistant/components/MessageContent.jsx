import React from 'react';
import { ExternalLink } from 'lucide-react';

const CLIENT_TAG = /\[VIEW_CLIENT:([0-9a-f-]{36}):?([^\]]*)\]/gi;

// **negrita** y botones [VIEW_CLIENT:uuid:nombre] dentro de una línea
function Inline({ text, onOpenClient }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(CLIENT_TAG)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [, id, name] = m;
    parts.push(
      <button
        key={'c' + m.index}
        onClick={() => onOpenClient?.(id, name)}
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-xs font-medium text-sky-400 hover:bg-sky-500/20"
      >
        {name || 'Ver cliente'} <ExternalLink size={10} />
      </button>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return parts.flatMap((p, i) => (typeof p !== 'string'
    ? [p]
    : p.split(/(\*\*[^*]+\*\*)/g).map((s, j) => (s.startsWith('**') && s.endsWith('**')
      ? <strong key={`${i}-${j}`} className="font-semibold text-chrome-text-active">{s.slice(2, -2)}</strong>
      : <React.Fragment key={`${i}-${j}`}>{s}</React.Fragment>))));
}

/** Markdown mínimo: párrafos, listas con guiones/números, títulos y negritas. */
export default function MessageContent({ text, onOpenClient }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;

  const flush = () => { if (list) { blocks.push(list); list = null; } };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) list = { type: 'list', ordered: /^\s*\d/.test(line), items: [] };
      list.items.push(bullet[1]);
      return;
    }
    flush();
    if (!line.trim()) { blocks.push({ type: 'space', key: idx }); return; }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(h ? { type: 'h', text: h[1] } : { type: 'p', text: line });
  });
  flush();

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === 'space') return null;
        if (b.type === 'h') return <p key={i} className="pt-1 font-semibold text-chrome-text-active"><Inline text={b.text} onOpenClient={onOpenClient} /></p>;
        if (b.type === 'p') return <p key={i}><Inline text={b.text} onOpenClient={onOpenClient} /></p>;
        const Tag = b.ordered ? 'ol' : 'ul';
        return (
          <Tag key={i} className={`space-y-0.5 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc'}`}>
            {b.items.map((it, j) => <li key={j}><Inline text={it} onOpenClient={onOpenClient} /></li>)}
          </Tag>
        );
      })}
    </div>
  );
}
