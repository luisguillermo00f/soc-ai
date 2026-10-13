// Markdown mínimo y seguro (sin HTML crudo) para las respuestas del asistente:
// párrafos, negrita, cursiva, listas, tablas y enlaces internos de la aplicación.

import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { VText } from './ai.tsx';

function inline(text: string, unverified: string[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\([^)\s]+\)|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<VText key={`${key}t${i++}`} text={text.slice(last, m.index)} unverified={unverified} />);
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${key}b${i++}`}><VText text={tok.slice(2, -2)} unverified={unverified} /></strong>);
    else if (tok.startsWith('`')) out.push(<code key={`${key}c${i++}`} className="mono">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      const href = lm[2]!;
      out.push(href.startsWith('/')
        ? <Link key={`${key}l${i++}`} to={href}>{lm[1]}</Link>
        : <span key={`${key}l${i++}`}>{lm[1]}</span>);
    } else out.push(<em key={`${key}e${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<VText key={`${key}t${i++}`} text={text.slice(last)} unverified={unverified} />);
  return out;
}

export function Markdown({ text, unverified = [] }: { text: string; unverified?: string[] }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const head = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) { rows.push(lines[i]!.split('|').slice(1, -1).map((c) => c.trim())); i++; }
      blocks.push(
        <div key={k++} className="table-wrap">
          <table><thead><tr>{head.map((h, j) => <th key={j}>{inline(h, unverified, `h${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className={/^[\d.,\s%+-]+$/.test(c) ? 'num' : undefined}>{inline(c, unverified, `c${ri}${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^#{1,4}\s/.test(line)) { blocks.push(<h4 key={k++}>{inline(line.replace(/^#+\s/, ''), unverified, `h${k}`)}</h4>); i++; continue; }
    if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\s*([-*]|\d+\.)\s/, '')); i++; }
      const children = items.map((it, j) => <li key={j}>{inline(it, unverified, `li${k}${j}`)}</li>);
      blocks.push(ordered ? <ol key={k++}>{children}</ol> : <ul key={k++}>{children}</ul>);
      continue;
    }
    // La primera línea se consume siempre: una línea que empieza con "|" sin su separador (tabla a medio llegar
    // durante el streaming) no es tabla todavía, y sin esto el bucle no avanzaba y congelaba la página.
    const para: string[] = [lines[i]!];
    i++;
    while (i < lines.length && lines[i]!.trim() && !/^\s*([-*]|\d+\.)\s/.test(lines[i]!) && !/^\s*\|/.test(lines[i]!) && !/^#{1,4}\s/.test(lines[i]!)) { para.push(lines[i]!); i++; }
    blocks.push(<p key={k++}>{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, unverified, `p${k}${j}`)}</Fragment>)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
