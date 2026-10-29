'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth';
import { API_URL } from '@/lib/api';
import { Avatar } from '@/components/ui';
import { PageHeader, useToast } from '@/components/kit';
import { cmp, FilterTabs, nextSort, SearchField, SortHeader, TableEmpty, TableFooter, TableHead, TableSkeleton, Th, usePager, type Sort } from '@/components/table';

type EvType = 'entry' | 'lunch' | 'exit' | 'incident';
interface Ev { id: number; type: EvType; note: string | null; late: number; tapped_at: string; local_time: string | null; local_date: string; student_name: string; class_name: string | null }

const TYPE: Record<EvType, { label: string; tone: string }> = {
  entry: { label: 'Entrada', tone: 'var(--ok)' },
  lunch: { label: 'Almoço', tone: 'var(--brand)' },
  exit: { label: 'Saída', tone: 'var(--gone)' },
  incident: { label: 'Ocorrência', tone: 'var(--bad)' },
};
type SortKey = 'when' | 'student' | 'class';
// Igual ao EVENTS_LIMIT da API: chegando aqui, há registos mais antigos que não vieram.
const LIMIT = 2000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 864e5));

export default function Historico() {
  const { session, ready, call } = useSession();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(iso(new Date()));
  const pager = usePager(25);
  const [type, setTypeRaw] = useState<'all' | EvType>('all');
  const [query, setQueryRaw] = useState('');
  const [sort, setSortRaw] = useState<Sort<SortKey>>({ key: 'when', dir: -1 });
  // Qualquer mudança de filtro ou ordem volta à primeira página.
  const setType = (v: 'all' | EvType) => { setTypeRaw(v); pager.reset(); };
  const setQuery = (v: string) => { setQueryRaw(v); pager.reset(); };
  const onSort = (k: SortKey) => { setSortRaw((s) => nextSort(s, k)); pager.reset(); };
  const clear = () => { setType('all'); setQuery(''); };
  const [rows, setRows] = useState<Ev[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const { show, node } = useToast();

  const qs = useMemo(() => new URLSearchParams({ from, to }).toString(), [from, to]);

  const load = useCallback(async () => {
    try { setRows(await call<Ev[]>(`/events?${qs}`)); } catch { show('Não foi possível carregar o histórico.', 'bad'); setRows([]); }
  }, [call, qs, show]);

  useEffect(() => { if (ready && session) { setRows(null); void load(); } }, [ready, session, load]);

  const bySearch = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || r.student_name.toLowerCase().includes(q));
  }, [rows, query]);
  const counts = useMemo(() => {
    const c: Record<'all' | EvType, number> = { all: bySearch.length, entry: 0, lunch: 0, exit: 0, incident: 0 };
    bySearch.forEach((r) => c[r.type]++);
    return c;
  }, [bySearch]);
  const shown = useMemo(() => {
    const val = (r: Ev) => sort.key === 'when' ? r.tapped_at : sort.key === 'student' ? r.student_name : r.class_name ?? '';
    return bySearch
      .filter((r) => type === 'all' || r.type === type)
      .sort((a, b) => (cmp(val(a), val(b)) || cmp(a.tapped_at, b.tapped_at)) * sort.dir);
  }, [bySearch, type, sort]);
  const filtered = type !== 'all' || !!query;
  const { rows: page } = pager.slice(shown);

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/reports/attendance.csv?${qs}${type === 'all' ? '' : `&type=${type}`}`, { headers: { authorization: `Bearer ${session!.token}` } });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `presencas-${from}_${to}.csv` });
      a.click(); URL.revokeObjectURL(url);
      show('Relatório exportado');
    } catch { show('Não foi possível exportar o relatório.', 'bad'); }
    setExporting(false);
  }

  const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <section>
      <PageHeader
        title="Histórico"
        subtitle="Entradas, almoços, saídas e ocorrências de cada aluno."
        action={session?.user.role === 'admin' && (
          <button onClick={exportCsv} disabled={exporting} className="btn btn-primary">{exporting ? 'A exportar' : type === 'all' ? 'Exportar CSV' : `Exportar CSV (${TYPE[type].label.toLowerCase()})`}</button>
        )}
      />

      <section className="card overflow-hidden" aria-labelledby="lista-registos">
        <TableHead
          id="lista-registos"
          title="Registos"
          subtitle={rows && rows.length >= LIMIT ? `A mostrar os ${LIMIT} registos mais recentes. Reduza o período ou exporte o relatório.` : 'Escolha o período; os toques no kiosk aparecem aqui assim que são enviados.'}
          action={(
            <div className="flex w-full items-end gap-2 sm:w-auto">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted">De<input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); pager.reset(); }} className="input min-h-10 py-1.5 text-sm" /></label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted">Até<input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); pager.reset(); }} className="input min-h-10 py-1.5 text-sm" /></label>
            </div>
          )}
        >
          <FilterTabs
            label="Filtrar por tipo"
            value={type}
            onChange={setType}
            options={[{ key: 'all' as const, label: 'Todos', count: counts.all }, ...(Object.keys(TYPE) as EvType[]).map((t) => ({ key: t, label: TYPE[t].label, tone: TYPE[t].tone, count: counts[t] }))]}
          />
          <SearchField value={query} onChange={setQuery} placeholder="Procurar aluno" />
        </TableHead>

        {rows === null ? <TableSkeleton /> : shown.length === 0 ? (
          <TableEmpty
            title={rows.length === 0 ? 'Sem registos neste período' : 'Nenhum registo corresponde aos filtros'}
            hint={rows.length === 0 ? 'Mude as datas. Os toques no kiosk aparecem aqui assim que são enviados.' : 'Mude o tipo ou a pesquisa.'}
            onClear={filtered && rows.length > 0 ? clear : undefined}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-left text-xs text-muted">
                  <tr>
                    <SortHeader k="when" label="Quando" sort={sort} onSort={onSort} className="pl-5" />
                    <SortHeader k="student" label="Aluno" sort={sort} onSort={onSort} />
                    <SortHeader k="class" label="Turma" sort={sort} onSort={onSort} />
                    <Th>Tipo</Th>
                    <Th className="pr-5">Nota</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {page.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/50">
                      <td className="whitespace-nowrap py-2.5 pl-5 pr-3"><span className="text-muted">{dayLabel(r.local_date)}</span> <span className="ml-1 font-medium tabular-nums">{r.local_time ?? '–'}</span></td>
                      <td className="px-3 py-2.5"><div className="flex min-w-0 items-center gap-3"><Avatar name={r.student_name} size={28} /><span className="truncate font-medium">{r.student_name}</span></div></td>
                      <td className="px-3 py-2.5 text-muted">{r.class_name ?? 'Sem turma'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          <span className="pill" style={{ ['--tone' as string]: TYPE[r.type].tone }}>{TYPE[r.type].label}</span>
                          {r.late ? <span className="pill" style={{ ['--tone' as string]: 'var(--late)' }}>Atraso</span> : null}
                        </div>
                      </td>
                      <td className="max-w-80 truncate py-2.5 pl-3 pr-5 text-muted" title={r.note ?? undefined}>{r.note ? r.note.replace(/^[a-z]+: /, '') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {page.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-14 shrink-0 text-xs leading-tight text-muted">{dayLabel(r.local_date)}<br /><span className="text-sm font-medium tabular-nums text-ink">{r.local_time ?? '–'}</span></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.student_name}</p>
                    <p className="truncate text-xs text-muted">{r.class_name ?? 'Sem turma'}{r.note ? ` · ${r.note.replace(/^[a-z]+: /, '')}` : ''}</p>
                  </div>
                  <span className="pill shrink-0" style={{ ['--tone' as string]: r.late ? 'var(--late)' : TYPE[r.type].tone }}>{TYPE[r.type].label}{r.late ? ', atraso' : ''}</span>
                </li>
              ))}
            </ul>

            <TableFooter pager={pager} total={shown.length} noun={['registo', 'registos']} onClear={filtered ? clear : undefined} />
          </>
        )}
      </section>
      {node}
    </section>
  );
}
