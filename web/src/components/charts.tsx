// Gráficos en SVG propio: una sola gramática visual (líneas de 2 px, barras ≤ 24 px con extremo
// redondeado de 4 px, grilla de 1 px, tooltip en todo gráfico interactivo, texto en tinta, nunca en color de serie).

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { HeatmapData } from '@shared/types.ts';
import { n0, pct } from '../lib/format.ts';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(ref.current);
    setW(Math.floor(ref.current.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

/** Marcas del eje en números redondos: elige 4, 5 o 3 divisiones según cuál dé pasos enteros. */
function ticks(max: number): number[] {
  const count = [4, 5, 3, 2].find((c) => Number.isInteger(max / c)) ?? 4;
  return Array.from({ length: count + 1 }, (_, i) => Math.round((max / count) * i * 100) / 100);
}

/* roundedTop: barra con extremo de datos redondeado (4 px) y base recta. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface LinePoint { label: string; value: number; tip?: ReactNode; flag?: 'spike' | 'drop' }

export function LineChart({ points, height = 220, series2, name = 'Accidentes', name2, ariaLabel }: {
  points: LinePoint[];
  height?: number;
  series2?: number[];
  name?: string;
  name2?: string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const W = Math.max(width, 200);
  const H = height;
  const max = niceMax(Math.max(1, ...points.map((p) => p.value), ...(series2 ?? [])));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length <= 1 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = (v: number) => pad.t + ih - (ih * v) / max;
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const values = points.map((p) => p.value);
  const area = `${line(values)}L${x(points.length - 1)},${pad.t + ih}L${x(0)},${pad.t + ih}Z`;
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 56))));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / iw) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div className="chart" ref={ref}>
      {series2 && (
        <div className="legend">
          <span><i className="line" style={{ background: 'var(--data)' }} />{name}</span>
          <span><i className="line" style={{ background: '#a1a1aa' }} />{name2}</span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <g className="axis">
          {ticks(max).map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'baseline' : 'gridline'} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end">{n0(t)}</text>
            </g>
          ))}
          {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{p.label}</text>
          ))}
        </g>
        <path d={area} fill="var(--data-wash)" />
        {series2 && <path d={line(series2)} fill="none" stroke="#a1a1aa" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="0" />}
        <path d={line(values)} fill="none" stroke="var(--data)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => p.flag && (
          <g key={`f${i}`}>
            <circle cx={x(i)} cy={y(p.value)} r={6} fill={p.flag === 'spike' ? 'var(--crit)' : 'var(--ctrl)'} stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--line-strong)" />
            <circle cx={x(hover)} cy={y(values[hover]!)} r={4.5} fill="var(--data)" stroke="var(--surface)" strokeWidth={2} />
            {series2 && <circle cx={x(hover)} cy={y(series2[hover]!)} r={4.5} fill="#a1a1aa" stroke="var(--surface)" strokeWidth={2} />}
          </g>
        )}
        {/* punto final etiquetado */}
        {points.length > 0 && hover === null && (
          <g>
            <circle cx={x(points.length - 1)} cy={y(values[values.length - 1]!)} r={4} fill="var(--data)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: y(Math.max(values[hover]!, series2?.[hover] ?? 0)) + (series2 ? 24 : 0) }}>
          <div><b>{points[hover]!.label}</b></div>
          <div>{name}: <b className="num">{n0(values[hover])}</b></div>
          {series2 && <div>{name2}: <b className="num">{n0(series2[hover])}</b></div>}
          {points[hover]!.tip && <div className="tip-sub">{points[hover]!.tip}</div>}
        </div>
      )}
    </div>
  );
}

export interface ColumnItem { label: string; value: number; value2?: number; tip?: ReactNode; highlight?: boolean }

export function Columns({ items, height = 180, name = 'Accidentes', name2, ariaLabel }: { items: ColumnItem[]; height?: number; name?: string; name2?: string; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 34, r: 8, t: 14, b: 24 };
  const W = Math.max(width, 200);
  const H = height;
  const pair = items.some((i) => i.value2 !== undefined);
  const max = niceMax(Math.max(1, ...items.flatMap((i) => [i.value, i.value2 ?? 0])));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const band = iw / items.length;
  const bw = Math.min(24, (band - 8) / (pair ? 2 : 1));
  const y = (v: number) => pad.t + ih - (ih * v) / max;
  return (
    <div className="chart" ref={ref}>
      {pair && (
        <div className="legend">
          <span><i style={{ background: 'var(--data)' }} />{name}</span>
          <span><i style={{ background: '#a1a1aa' }} />{name2}</span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
        <g className="axis">
          {ticks(max).map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'baseline' : 'gridline'} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end">{n0(t)}</text>
            </g>
          ))}
          {items.map((it, i) => <text key={i} x={pad.l + band * i + band / 2} y={H - 6} textAnchor="middle">{it.label}</text>)}
        </g>
        {items.map((it, i) => {
          const cx = pad.l + band * i + band / 2;
          const x1 = pair ? cx - bw - 1 : cx - bw / 2;
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
              <path d={barPath(x1, y(it.value), bw, ih + pad.t - y(it.value))} fill={it.highlight === false ? '#a1a1aa' : 'var(--data)'} opacity={hover === null || hover === i ? 1 : 0.55} />
              {pair && <path d={barPath(cx + 1, y(it.value2 ?? 0), bw, ih + pad.t - y(it.value2 ?? 0))} fill="#a1a1aa" opacity={hover === null || hover === i ? 1 : 0.55} />}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%`, top: y(Math.max(items[hover]!.value, items[hover]!.value2 ?? 0)) }}>
          <div><b>{items[hover]!.label}</b></div>
          <div>{name}: <b className="num">{n0(items[hover]!.value)}</b></div>
          {pair && <div>{name2}: <b className="num">{n0(items[hover]!.value2)}</b></div>}
          {items[hover]!.tip && <div className="tip-sub">{items[hover]!.tip}</div>}
        </div>
      )}
    </div>
  );
}

export interface BarItem { key: string; label: string; count: number; share?: number; sub?: string }

export function BarList({ items, limit = 8, onSelect, muted, showShare = true }: { items: BarItem[]; limit?: number; onSelect?: (it: BarItem) => void; muted?: (it: BarItem) => boolean; showShare?: boolean }) {
  const list = items.slice(0, limit);
  const max = Math.max(1, ...list.map((i) => i.count));
  if (!list.length) return <p className="faint" style={{ fontSize: 'var(--t-md)' }}>Sin datos para esta variable.</p>;
  return (
    <div className="bars">
      {list.map((it) => {
        const inner = (
          <>
            <span className="label" title={it.label}>{it.label}</span>
            <span className="val">{n0(it.count)}{showShare && it.share !== undefined ? ` · ${pct(it.share)}` : ''}{it.sub ? ` · ${it.sub}` : ''}</span>
            <span className="track"><span className="fill" style={{ width: `${(it.count / max) * 100}%`, display: 'block' }} /></span>
          </>
        );
        const cls = `bar-row${muted?.(it) ? ' muted-row' : ''}`;
        return onSelect
          ? <button key={it.key} type="button" className={cls} onClick={() => onSelect(it)}>{inner}</button>
          : <div key={it.key} className={cls}>{inner}</div>;
      })}
    </div>
  );
}

const BLUE = ['#f4f8fd', '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281'];

export function Heatmap({ data, onCell, rowWidth = 220 }: { data: HeatmapData; onCell?: (row: string, col: string) => void; rowWidth?: number }) {
  const [tip, setTip] = useState<{ r: number; c: number } | null>(null);
  const max = Math.max(1, ...data.cells.flat());
  const color = (v: number) => (v === 0 ? 'var(--surface-2)' : BLUE[Math.min(BLUE.length - 1, 1 + Math.floor((v / max) * (BLUE.length - 2)))]);
  const ink = (v: number) => (v / max > 0.55 ? '#fff' : 'var(--ink)');
  return (
    <div className="table-wrap" onMouseLeave={() => setTip(null)}>
      <div className="heat" style={{ gridTemplateColumns: `${rowWidth}px repeat(${data.cols.length}, minmax(34px, 1fr))`, minWidth: rowWidth + data.cols.length * 36 }} role="table" aria-label="Mapa de calor">
        <div />
        {data.cols.map((c) => <div key={c.key} className="hcol-label" title={c.label} role="columnheader">{c.label}</div>)}
        {data.rows.map((r, ri) => (
          <div key={r.key} style={{ display: 'contents' }} role="row">
            <div className="hrow-label" title={r.label} role="rowheader">{r.label}</div>
            {data.cols.map((c, ci) => {
              const v = data.cells[ri]![ci]!;
              const active = tip?.r === ri && tip?.c === ci;
              return (
                <div
                  key={c.key}
                  role="cell"
                  className="hcell"
                  style={{ background: color(v), color: ink(v), cursor: onCell && v ? 'pointer' : 'default', outline: active ? '2px solid var(--ink)' : undefined }}
                  onMouseEnter={() => setTip({ r: ri, c: ci })}
                  onClick={() => v && onCell?.(r.key, c.key)}
                  title={`${r.label} · ${c.label}: ${v} (${pct(r.total ? v / r.total : 0)} de la fila)`}
                >
                  {v || ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, width = 96, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const x = (i: number) => (width * i) / Math.max(1, values.length - 1);
  const y = (v: number) => height - 2 - ((height - 4) * v) / max;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const recent = values.slice(-6);
  const rd = recent.map((v, i) => `${i ? 'L' : 'M'}${x(values.length - 6 + i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d={d} fill="none" stroke="#c4c4cc" strokeWidth={1.5} strokeLinejoin="round" />
      {values.length > 6 && <path d={rd} fill="none" stroke="var(--data)" strokeWidth={1.5} strokeLinejoin="round" />}
    </svg>
  );
}

const COMPARE_COLORS = ['var(--data)', 'var(--data-2)', 'var(--data-3)', 'var(--data-4)'];
export { COMPARE_COLORS };

export function MultiLine({ labels, series, height = 220, ariaLabel }: { labels: string[]; series: { name: string; values: number[]; color: string }[]; height?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const W = Math.max(width, 200);
  const H = height;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (iw * i) / Math.max(1, labels.length - 1);
  const y = (v: number) => pad.t + ih - (ih * v) / max;
  const every = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(iw / 56))));
  return (
    <div className="chart" ref={ref}>
      <div className="legend">{series.map((s) => <span key={s.name}><i className="line" style={{ background: s.color }} />{s.name}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={ariaLabel}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(labels.length - 1, Math.round(((px - pad.l) / iw) * (labels.length - 1))))); }}
        onPointerLeave={() => setHover(null)}>
        <g className="axis">
          {ticks(max).map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'baseline' : 'gridline'} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end">{n0(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => (i % every === 0 || i === labels.length - 1) && <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{l}</text>)}
        </g>
        {series.map((s) => (
          <path key={s.name} d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--line-strong)" />}
        {hover !== null && series.map((s) => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: y(Math.max(...series.map((s) => s.values[hover]!))) }}>
          <div><b>{labels[hover]}</b></div>
          {series.map((s) => <div key={s.name}>{s.name}: <b className="num">{n0(s.values[hover])}</b></div>)}
        </div>
      )}
    </div>
  );
}
