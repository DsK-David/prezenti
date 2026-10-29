'use client';

import { useMemo, useState } from 'react';
import { Avatar } from './ui';
import { FilterTabs, SearchField, SortHeader, Th, TableHead, TableFooter, TableEmpty, TableSkeleton, nextSort, usePager, type Sort } from './table';
import { STATUS, type Status, type TodayRow } from '@/lib/status';
import { download, toCsv } from '@/lib/csv';

type Filter = Status | 'all';
type SortKey = 'name' | 'class' | 'entry' | 'status';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todos' }, { key: 'present', label: 'Presentes' }, { key: 'late', label: 'Atrasados' },
  { key: 'absent', label: 'Ausentes' }, { key: 'left', label: 'Já saíram' },
];
// Ordem de "estado": quem precisa de atenção primeiro.
const STATUS_ORDER: Record<Status, number> = { absent: 0, late: 1, present: 2, left: 3 };

// Régua do dia escolar: 07:00 às 18:00.
const DAY_START = 7 * 60, DAY_END = 18 * 60;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const at = (mins: number) => `${(Math.min(Math.max(mins, DAY_START), DAY_END) - DAY_START) / (DAY_END - DAY_START) * 100}%`;
const LUNCH = '#0e8fa8';

/** O dia do aluno numa linha: entrada, almoço e saída no sítio da hora em que aconteceram. */
function DayTrack({ row, now, lateAfter }: { row: TodayRow; now: number; lateAfter?: string }) {
  const entry = row.entry_time ? toMin(row.entry_time) : null;
  const exit = row.exit_time ? toMin(row.exit_time) : null;
  const lunch = row.lunch_time ? toMin(row.lunch_time) : null;
  const end = exit ?? Math.min(now, DAY_END);
  const label = row.entry_time
    ? `Entrada ${row.entry_time}${row.lunch_time ? `, almoço ${row.lunch_time}` : ''}${row.exit_time ? `, saída ${row.exit_time}` : ', ainda na escola'}`
    : 'Sem registo de entrada hoje';
  return (
    <div className="relative h-5 w-full min-w-40" role="img" aria-label={label}>
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      {[8, 12, 16].map((h) => <span key={h} className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-line" style={{ left: at(h * 60) }} />)}
      {lateAfter && <span className="absolute top-0.5 bottom-0.5 w-px bg-late/40" style={{ left: at(toMin(lateAfter)) }} />}
      {entry !== null && end > entry && (
        <span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: at(entry), width: `calc(${at(end)} - ${at(entry)})`, background: exit ? 'var(--gone)' : 'var(--brand)', opacity: exit ? 0.35 : 0.28 }} />
      )}
      {entry !== null && <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface" style={{ left: at(entry), background: row.late ? 'var(--late)' : 'var(--ok)' }} />}
      {lunch !== null && <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface" style={{ left: at(lunch), background: LUNCH }} />}
      {exit !== null && <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gone bg-surface" style={{ left: at(exit) }} />}
    </div>
  );
}

function Time({ value, tone }: { value: string | null; tone?: string }) {
  return value
    ? <span className="tabular-nums" style={tone ? { color: tone, fontWeight: 600 } : undefined}>{value}</span>
    : <span className="text-muted/50" aria-label="sem registo">–</span>;
}

export function TodayTable({ rows, lateAfter, onIncident }: { rows: TodayRow[] | null; lateAfter?: string; onIncident: (r: TodayRow) => void }) {
  const pager = usePager();
  const [filter, setFilterRaw] = useState<Filter>('all');
  const [query, setQueryRaw] = useState('');
  const [klass, setKlassRaw] = useState('');
  const [sort, setSortRaw] = useState<Sort<SortKey>>({ key: 'name', dir: 1 });
  // Qualquer mudança de filtro ou ordem volta à primeira página.
  const setFilter = (v: Filter) => { setFilterRaw(v); pager.reset(); };
  const setQuery = (v: string) => { setQueryRaw(v); pager.reset(); };
  const setKlass = (v: string) => { setKlassRaw(v); pager.reset(); };

  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes();

  const counts = useMemo(() => {
    const c = { all: 0, present: 0, late: 0, absent: 0, left: 0 };
    (rows ?? []).filter((r) => !klass || r.class_name === klass).forEach((r) => { c.all++; c[r.status]++; });
    return c;
  }, [rows, klass]);
  const klasses = useMemo(() => [...new Set((rows ?? []).map((r) => r.class_name).filter(Boolean))].sort((a, b) => a!.localeCompare(b!, 'pt')) as string[], [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => (filter === 'all' || r.status === filter) && (!klass || r.class_name === klass) && (!q || r.name.toLowerCase().includes(q)));
    const val = (r: TodayRow): string | number => sort.key === 'name' ? r.name : sort.key === 'class' ? r.class_name ?? '' : sort.key === 'status' ? STATUS_ORDER[r.status] : r.entry_time ?? '';
    return list.sort((a, b) => {
      const va = val(a), vb = val(b);
      // Sem hora de entrada fica sempre no fim, em qualquer direção.
      if (sort.key === 'entry' && (va === '' || vb === '')) return va === vb ? 0 : va === '' ? 1 : -1;
      const c = typeof va === 'number' ? va - (vb as number) : va.localeCompare(vb as string, 'pt');
      return (c || a.name.localeCompare(b.name, 'pt')) * sort.dir;
    });
  }, [rows, filter, query, klass, sort]);

  const { rows: slice } = pager.slice(shown);
  const filtered = filter !== 'all' || !!query || !!klass;

  const onSort = (key: SortKey) => { setSortRaw((s) => nextSort(s, key)); pager.reset(); };
  const clear = () => { setFilter('all'); setQuery(''); setKlass(''); };
  const exportCsv = () => download(`presencas-hoje.csv`, toCsv([
    ['Aluno', 'Turma', 'Estado', 'Entrada', 'Almoço', 'Saída'],
    ...shown.map((r) => [r.name, r.class_name ?? '', STATUS[r.status].label, r.entry_time ?? '', r.lunch_time ?? '', r.exit_time ?? '']),
  ]));

  return (
    <section className="card overflow-hidden" aria-labelledby="hoje-alunos">
      <TableHead
        id="hoje-alunos"
        title="Registo de hoje"
        subtitle="Entrada, almoço e saída de cada aluno. Atualiza sozinho a cada 10 segundos."
        action={(
          <button onClick={exportCsv} disabled={!shown.length} className="btn btn-ghost py-2 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" /></svg>
            Exportar CSV
          </button>
        )}
      >
        <FilterTabs
          label="Filtrar por estado"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, count: counts[f.key], tone: f.key === 'all' ? undefined : STATUS[f.key].tone }))}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchField value={query} onChange={setQuery} placeholder="Procurar aluno" />
          {klasses.length > 1 && (
            <select value={klass} onChange={(e) => setKlass(e.target.value)} aria-label="Filtrar por turma" className="input min-h-10 py-2 text-sm sm:w-48">
              <option value="">Todas as turmas</option>{klasses.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
        </div>
      </TableHead>

      {rows === null ? (
        <TableSkeleton />
      ) : shown.length === 0 ? (
        <TableEmpty
          title={rows.length === 0 ? 'Ainda não há alunos na escola' : 'Nenhum aluno corresponde aos filtros'}
          hint={rows.length === 0 ? 'Adicione alunos e associe os cartões em Alunos e cartões.' : 'Mude o estado, a turma ou a pesquisa para ver mais alunos.'}
          onClear={filtered && rows.length > 0 ? clear : undefined}
        />
      ) : (
        <>
          {/* Tabela a partir de md; em ecrãs pequenos cada aluno vira um bloco. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-left text-xs text-muted">
                <tr>
                  <SortHeader k="name" label="Aluno" sort={sort} onSort={onSort} className="pl-5" />
                  <SortHeader k="class" label="Turma" sort={sort} onSort={onSort} />
                  <SortHeader k="status" label="Estado" sort={sort} onSort={onSort} />
                  <SortHeader k="entry" label="Entrada" sort={sort} onSort={onSort} />
                  <Th>Almoço</Th>
                  <Th>Saída</Th>
                  <th scope="col" className="hidden w-[28%] px-3 py-2.5 font-medium xl:table-cell">
                    <span className="flex justify-between"><span>07:00</span><span>O dia</span><span>18:00</span></span>
                  </th>
                  <th scope="col" className="py-2.5 pl-3 pr-5"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {slice.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/50">
                    <td className="py-2.5 pl-5 pr-3">
                      <div className="flex min-w-0 items-center gap-3"><Avatar name={r.name} size={32} /><span className="truncate font-medium">{r.name}</span></div>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{r.class_name ?? 'Sem turma'}</td>
                    <td className="px-3 py-2.5"><span className="pill" style={{ ['--tone' as string]: STATUS[r.status].tone }}>{STATUS[r.status].label}</span></td>
                    <td className="px-3 py-2.5"><Time value={r.entry_time} tone={r.late ? 'var(--late)' : undefined} /></td>
                    <td className="px-3 py-2.5"><Time value={r.lunch_time} /></td>
                    <td className="px-3 py-2.5"><Time value={r.exit_time} /></td>
                    <td className="hidden px-3 py-2.5 xl:table-cell"><DayTrack row={r} now={now} lateAfter={lateAfter} /></td>
                    <td className="py-2.5 pl-3 pr-5 text-right">
                      <button onClick={() => onIncident(r)} className="btn btn-quiet whitespace-nowrap text-sm">Registar ocorrência</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-line md:hidden">
            {slice.map((r) => (
              <li key={r.id} className="flex flex-col gap-2.5 px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <Avatar name={r.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted">{r.class_name ?? 'Sem turma'}</p>
                  </div>
                  <span className="pill shrink-0" style={{ ['--tone' as string]: STATUS[r.status].tone }}>{STATUS[r.status].label}</span>
                </div>
                <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
                  {([['Entrada', r.entry_time, r.late ? 'var(--late)' : undefined], ['Almoço', r.lunch_time], ['Saída', r.exit_time]] as const).map(([l, v, tone]) => (
                    <div key={l}><dt className="text-xs text-muted">{l}</dt><dd><Time value={v} tone={tone} /></dd></div>
                  ))}
                </dl>
                <button onClick={() => onIncident(r)} className="btn btn-quiet self-start px-0 text-sm">Registar ocorrência</button>
              </li>
            ))}
          </ul>

          <TableFooter pager={pager} total={shown.length} noun={['aluno', 'alunos']} onClear={filtered ? clear : undefined} />
        </>
      )}
    </section>
  );
}
