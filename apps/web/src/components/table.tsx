'use client';

import { useState } from 'react';
import { Pagination } from './kit';

/** Peças comuns das listas do painel: filtros, pesquisa, ordenação e paginação. */

export interface Sort<K extends string> { key: K; dir: 1 | -1 }
/** Clicar na mesma coluna inverte; numa coluna nova começa crescente. */
export const nextSort = <K extends string>(s: Sort<K>, key: K): Sort<K> => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 });

const PAGE_SIZES = [10, 25, 50];

/** Página atual e tamanho. Quem filtra chama `reset()` para voltar à primeira página. */
export function usePager(initial = 10) {
  const [page, setPage] = useState(1);
  const [size, setSizeRaw] = useState(initial);
  return {
    page, size, setPage,
    setSize: (n: number) => { setSizeRaw(n); setPage(1); },
    reset: () => setPage(1),
    slice<T>(list: T[]) {
      const pages = Math.max(1, Math.ceil(list.length / size));
      const current = Math.min(page, pages);
      return { rows: list.slice((current - 1) * size, current * size), pages, current, total: list.length };
    },
  };
}
export type Pager = ReturnType<typeof usePager>;

export function FilterTabs<K extends string>({ options, value, onChange, label }: {
  options: Array<{ key: K; label: string; count?: number; tone?: string }>; value: K; onChange: (k: K) => void; label: string;
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]" role="group" aria-label={label}>
      {options.map((f) => {
        const on = value === f.key;
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            aria-pressed={on}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${on ? 'border-transparent bg-ink text-white' : 'border-line bg-surface text-muted hover:border-[#c9d1e2] hover:text-ink'}`}
          >
            {f.tone && <span className="h-2 w-2 rounded-full" style={{ background: f.tone }} aria-hidden />}
            {f.label}
            {f.count !== undefined && <span className={`min-w-6 rounded-md px-1.5 text-center text-xs tabular-nums ${on ? 'bg-white/15' : 'bg-surface-2'}`}>{f.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, className = 'sm:w-64' }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{placeholder}</span>
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input min-h-10 py-2 pl-9 text-sm" />
    </label>
  );
}

export function SortHeader<K extends string>({ k, label, sort, onSort, className = '' }: { k: K; label: string; sort: Sort<K>; onSort: (k: K) => void; className?: string }) {
  const on = sort.key === k;
  return (
    <th scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2.5 font-medium ${className}`}>
      <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 rounded-md hover:text-ink ${on ? 'text-ink' : ''}`}>
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={on ? 'opacity-100' : 'opacity-30'}>
          <path d="M5 1.5 8 4.5H2L5 1.5Z" fill="currentColor" opacity={on && sort.dir === -1 ? 0.3 : 1} />
          <path d="M5 8.5 2 5.5h6L5 8.5Z" fill="currentColor" opacity={on && sort.dir === 1 ? 0.3 : 1} />
        </svg>
      </button>
    </th>
  );
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={`px-3 py-2.5 font-medium ${className}`}>{children}</th>;
}

/** Cabeçalho do cartão da lista: título, ação e a barra de filtros por baixo. */
export function TableHead({ id, title, subtitle, action, children }: { id: string; title: string; subtitle?: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-line p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={id} className="font-display text-title2">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children && <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">{children}</div>}
    </div>
  );
}

/** "11–20 de 25 alunos", limpar filtros, linhas por página e paginação. */
export function TableFooter({ pager, total, noun, onClear }: { pager: Pager; total: number; noun: [string, string]; onClear?: () => void }) {
  const pages = Math.max(1, Math.ceil(total / pager.size));
  const current = Math.min(pager.page, pages);
  return (
    <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-center gap-4">
        <p className="tabular-nums">{(current - 1) * pager.size + 1}–{Math.min(current * pager.size, total)} de {total} {total === 1 ? noun[0] : noun[1]}</p>
        {onClear && <button onClick={onClear} className="font-medium text-brand hover:underline">Limpar filtros</button>}
      </div>
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 whitespace-nowrap">
          Por página
          <select value={pager.size} onChange={(e) => pager.setSize(Number(e.target.value))} className="input min-h-9 w-auto py-1 pl-2.5 pr-7 text-sm">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <Pagination page={current} pages={pages} onPage={pager.setPage} />
      </div>
    </div>
  );
}

export function TableEmpty({ title, hint, onClear }: { title: string; hint: string; onClear?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="font-display text-title3">{title}</p>
      <p className="max-w-sm text-sm text-muted">{hint}</p>
      {onClear && <button onClick={onClear} className="btn btn-ghost mt-2 text-sm">Limpar filtros</button>}
    </div>
  );
}

export function TableSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="divide-y divide-line" aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5"><div className="skeleton h-9 w-9 rounded-full" /><div className="skeleton h-4 w-44" /><div className="skeleton ml-auto h-4 w-28" /></div>
      ))}
    </div>
  );
}

export const cmp = (a: string | number, b: string | number) => typeof a === 'number' ? a - (b as number) : a.localeCompare(b as string, 'pt');
