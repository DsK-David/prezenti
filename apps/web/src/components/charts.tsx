'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconChip, RingMark } from './ui';

/* Gráficos desenhados à mão em SVG/HTML. Regras (dataviz): marcas finas, grelha hairline recessiva,
   cor só nas marcas (texto em tokens de texto), legenda com 2+ séries, tooltip em todas as marcas,
   tabela equivalente, nunca um número em cada ponto. */

export const SERIES = { present: 'var(--brand)', late: 'var(--late)', left: '#a3b1cc' } as const;

export function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function useCountUp(target: number, ms = 700) {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); prev.current = target; return; }
    const from = prev.current, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick); else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const niceMax = (m: number) => {
  if (m <= 0) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export const dayShort = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
export const dayLong = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });

/* ───────── Cartão com alternância gráfico ↔ tabela ───────── */
export function ChartCard({ title, subtitle, icon, legend, table, children, className = '' }: {
  title: string; subtitle?: string; icon?: React.ReactNode; legend?: React.ReactNode;
  table: { head: string[]; rows: (string | number)[][] };
  children: React.ReactNode; className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`card anim-rise flex flex-col gap-3 p-5 ${className}`} aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          {icon && <IconChip>{icon}</IconChip>}
          <div>
            <h2 className="font-display text-lg leading-tight">{title}</h2>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
        </div>
        <button onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} className="btn btn-quiet px-2 py-1 text-xs">{asTable ? 'Ver gráfico' : 'Ver tabela'}</button>
      </header>
      {legend}
      {asTable ? (
        <div className="max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs text-muted"><tr>{table.head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-3 py-1.5 tabular-nums">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => <li key={i.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-line" style={{ background: i.color }} aria-hidden />{i.label}</li>)}
    </ul>
  );
}

function Tip({ x, w, y, lines }: { x: number; w: number; y: number; lines: string[] }) {
  const left = Math.min(Math.max(x, 84), Math.max(w - 84, 84));
  return (
    <div className="pointer-events-none absolute z-10 w-max max-w-[200px] -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-[0_8px_24px_-8px_rgb(22_32_58/0.25)]" style={{ left, top: y - 10 }} role="tooltip">
      <p className="font-display text-base leading-tight text-ink">{lines[0]}</p>
      {lines.slice(1).map((l, i) => <p key={i} className="text-muted">{l}</p>)}
    </div>
  );
}

/* ───────── Linha com área: série única, crosshair + tooltip ───────── */
export interface TrendPoint { key: string; label: string; value: number; tip: string[] }

export function TrendChart({ points, unit = '%', height = 230, ariaLabel }: { points: TrendPoint[]; unit?: string; height?: number; ariaLabel: string }) {
  const [ref, w] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const m = { l: 40, r: 18, t: 16, b: 28 };
  const iw = Math.max(0, w - m.l - m.r), ih = height - m.t - m.b;
  const vals = points.map((p) => p.value);
  const hi = unit === '%' ? 100 : niceMax(Math.max(...vals, 1));
  const rough = vals.length ? Math.min(...vals) - 5 : 0;
  const tickStep = unit === '%' ? (hi - Math.max(0, rough) <= 40 ? 10 : 20) : Math.max(1, hi / 4);
  const lo = Math.max(0, Math.floor(rough / tickStep) * tickStep);
  const x = (i: number) => m.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => m.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-6; t += tickStep) ticks.push(Math.round(t));
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(points.length - 1)},${m.t + ih} L${x(0)},${m.t + ih} Z` : '';
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 56))));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left) / (r.width || 1);
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((a) => Math.max(0, (a ?? points.length) - 1)); }
    if (e.key === 'Escape') setActive(null);
  };
  const last = points.length - 1;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {w > 0 && points.length > 0 && (
        <>
          <svg width={w} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
                <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px] tabular-nums">{t}{unit}</text>
              </g>
            ))}
            <path d={area} fill="var(--brand)" fillOpacity="0.1" className="viz-area" />
            <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="viz-line" />
            {points.map((p, i) => (i % step === 0 || i === last) && (
              <text key={p.key} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-muted text-[11px]">{p.label}</text>
            ))}
            {active === null && (
              <g className="viz-dot">
                <circle cx={x(last)} cy={y(points[last].value)} r="6" fill="var(--surface)" />
                <circle cx={x(last)} cy={y(points[last].value)} r="4" fill="var(--brand)" />
                <text x={x(last)} y={y(points[last].value) - 12} textAnchor="end" className="fill-ink text-xs font-semibold tabular-nums">{points[last].value}{unit}</text>
              </g>
            )}
            {active !== null && (
              <g>
                <line x1={x(active)} x2={x(active)} y1={m.t} y2={m.t + ih} stroke="var(--muted)" strokeOpacity="0.45" />
                <circle cx={x(active)} cy={y(points[active].value)} r="6" fill="var(--surface)" />
                <circle cx={x(active)} cy={y(points[active].value)} r="4" fill="var(--brand)" />
              </g>
            )}
            <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" tabIndex={0} aria-label={`${ariaLabel}. Use as setas para ver cada dia.`}
              onPointerMove={onMove} onPointerLeave={() => setActive(null)} onKeyDown={onKey} onBlur={() => setActive(null)} className="outline-none focus-visible:stroke-[var(--brand)]" style={{ touchAction: 'pan-y' }} />
          </svg>
          {active !== null && <Tip x={x(active)} w={w} y={y(points[active].value)} lines={points[active].tip} />}
        </>
      )}
    </div>
  );
}

/* ───────── Colunas: cada coluna é o alvo do hover ───────── */
export interface Column { key: string; label?: string; value: number; color: string; tip: string[]; parts?: { value: number; color: string }[] }

export function ColumnChart({ items, height = 210, marker, ariaLabel, emptyText }: {
  items: Column[]; height?: number; marker?: { at: number; label: string }; ariaLabel: string; emptyText?: string;
}) {
  const [ref, w] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const m = { l: 32, r: 8, t: 20, b: 26 };
  const iw = Math.max(0, w - m.l - m.r), ih = height - m.t - m.b;
  const max = niceMax(Math.max(...items.map((i) => i.value), 0));
  const slot = items.length ? iw / items.length : 0;
  const bw = Math.min(24, Math.max(3, slot - 4));
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max].filter((t, i, a) => Number.isInteger(t) && a.indexOf(t) === i);
  const peak = items.reduce((b, it, i) => (it.value > (items[b]?.value ?? -1) ? i : b), 0);
  const empty = items.every((i) => i.value === 0);
  const step = Math.max(1, Math.ceil(items.length / Math.max(2, Math.floor(iw / 44))));

  // Segmento entre duas alturas; só o de cima tem a ponta redonda (4px) e há 2px de ar entre segmentos.
  const seg = (cx: number, from: number, to: number, round: boolean) => {
    const x0 = cx - bw / 2, bottom = y(from) - (from > 0 ? 2 : 0), top = y(to), h = Math.max(0, bottom - top), r = round ? Math.min(4, bw / 2, h) : 0;
    return r
      ? `M${x0},${bottom} V${top + r} a${r},${r} 0 0 1 ${r},${-r} H${x0 + bw - r} a${r},${r} 0 0 1 ${r},${r} V${bottom} Z`
      : `M${x0},${bottom} V${top} H${x0 + bw} V${bottom} Z`;
  };
  const segments = (it: Column) => {
    const parts = (it.parts ?? [{ value: it.value, color: it.color }]).filter((p) => p.value > 0);
    let acc = 0;
    return parts.map((p, k) => { const from = acc; acc += p.value; return { d: (cx: number) => seg(cx, from, acc, k === parts.length - 1), color: p.color, k }; });
  };

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {w > 0 && (
        <>
          <svg width={w} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
                <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px] tabular-nums">{t}</text>
              </g>
            ))}
            {items.map((it, i) => {
              const cx = m.l + slot * i + slot / 2;
              return (
                <g key={it.key}>
                  {it.value > 0 && segments(it).map((s) => (
                    <path key={s.k} d={s.d(cx)} fill={s.color} className="viz-bar" style={{ animationDelay: `${Math.min(i, 14) * 22}ms`, opacity: active === null || active === i ? 1 : 0.5 }} />
                  ))}
                  {it.label && i % step === 0 && <text x={cx} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">{it.label}</text>}
                  {i === peak && it.value > 0 && active === null && <text x={cx} y={y(it.value) - 6} textAnchor="middle" className="fill-ink text-xs font-semibold tabular-nums">{it.value}</text>}
                  <rect x={m.l + slot * i} y={m.t} width={slot} height={ih} fill="transparent" tabIndex={0} className="outline-none focus-visible:stroke-[var(--brand)]"
                    aria-label={it.tip.join(', ')} onPointerEnter={() => setActive(i)} onPointerMove={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
                </g>
              );
            })}
            {marker && (
              <g>
                <line x1={m.l + slot * marker.at} x2={m.l + slot * marker.at} y1={m.t - 6} y2={m.t + ih} stroke="var(--late)" strokeWidth="1" />
                <text x={m.l + slot * marker.at + 6} y={m.t - 8} className="fill-late text-[11px] font-semibold">{marker.label}</text>
              </g>
            )}
            <line x1={m.l} x2={w - m.r} y1={m.t + ih} y2={m.t + ih} stroke="var(--line)" />
          </svg>
          {active !== null && items[active] && <Tip x={m.l + slot * active + slot / 2} w={w} y={y(items[active].value)} lines={items[active].tip} />}
          {empty && emptyText && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pb-6 text-sm text-muted">
              <span className="anim-blink text-brand/50"><RingMark size={28} /></span>{emptyText}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───────── Barras horizontais empilhadas (parte do todo por turma) ───────── */
export interface StackRow { key: string; label: string; total: number; present: number; late: number }

export function StackBars({ rows }: { rows: StackRow[] }) {
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const show = useCallback((i: number, e: React.PointerEvent | React.FocusEvent) => {
    const b = box.current?.getBoundingClientRect();
    const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (b) setTip({ i, x: t.left - b.left + t.width / 2, y: t.top - b.top });
  }, []);
  const r = tip ? rows[tip.i] : null;
  return (
    <div ref={box} className="relative flex flex-col gap-3.5">
      {rows.map((row, i) => {
        const pres = row.total ? (row.present / row.total) * 100 : 0, late = row.total ? (row.late / row.total) * 100 : 0;
        return (
          <div key={row.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm" tabIndex={0}
            onPointerEnter={(e) => show(i, e)} onPointerLeave={() => setTip(null)} onFocus={(e) => show(i, e)} onBlur={() => setTip(null)}
            aria-label={`${row.label}: ${row.present + row.late} de ${row.total} presentes, ${row.late} em atraso`}>
            <span className="truncate font-medium">{row.label}</span>
            <div className="flex h-3.5 overflow-hidden rounded-[7px] bg-surface-2" aria-hidden>
              <div className="viz-hbar h-full rounded-r-[4px]" style={{ width: `${pres}%`, background: SERIES.present, animationDelay: `${i * 50}ms`, marginRight: pres && late ? 2 : 0, opacity: tip && tip.i !== i ? 0.5 : 1 }} />
              <div className="viz-hbar h-full rounded-r-[4px]" style={{ width: `${late}%`, background: SERIES.late, animationDelay: `${i * 50 + 80}ms`, opacity: tip && tip.i !== i ? 0.5 : 1 }} />
            </div>
            <span className="w-24 text-right tabular-nums text-muted"><span className="font-semibold text-ink">{row.present + row.late}</span> de {row.total}</span>
          </div>
        );
      })}
      {tip && r && <Tip x={tip.x} w={box.current?.clientWidth ?? 300} y={tip.y} lines={[`${r.label}: ${r.present + r.late} de ${r.total}`, `${r.present} a tempo`, `${r.late} em atraso`, `${r.total - r.present - r.late} ausentes`]} />}
    </div>
  );
}

/* ───────── Minigráfico para os cartões de resumo ───────── */
export function Sparkline({ values, width = 92, height = 30 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const x = (i: number) => 3 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => height - 4 - ((v - lo) / span) * (height - 8);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const li = values.length - 1;
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke="var(--muted)" strokeOpacity="0.5" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="viz-line" />
      <circle cx={x(li)} cy={y(values[li])} r="4.5" fill="var(--surface)" />
      <circle cx={x(li)} cy={y(values[li])} r="3" fill="var(--brand)" className="viz-dot" />
    </svg>
  );
}
