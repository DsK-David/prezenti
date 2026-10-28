'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth';
import { API_URL } from '@/lib/api';
import { Avatar } from '@/components/ui';
import { Empty, PageHeader, SkeletonRows, useToast } from '@/components/kit';

type EvType = 'entry' | 'lunch' | 'exit' | 'incident';
interface Ev { id: number; type: EvType; note: string | null; late: number; tapped_at: string; local_time: string | null; local_date: string; student_name: string; class_name: string | null }

const TYPE: Record<EvType, { label: string; tone: string }> = {
  entry: { label: 'Entrada', tone: 'var(--ok)' },
  lunch: { label: 'Almoço', tone: 'var(--brand)' },
  exit: { label: 'Saída', tone: 'var(--gone)' },
  incident: { label: 'Ocorrência', tone: 'var(--bad)' },
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 864e5));

export default function Historico() {
  const { session, ready, call } = useSession();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(iso(new Date()));
  const [type, setType] = useState<'' | EvType>('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Ev[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const { show, node } = useToast();

  const qs = useMemo(() => new URLSearchParams({ from, to, ...(type ? { type } : {}) }).toString(), [from, to, type]);

  const load = useCallback(async () => {
    try { setRows(await call<Ev[]>(`/events?${qs}`)); } catch { show('Não foi possível carregar o histórico.', 'bad'); setRows([]); }
  }, [call, qs, show]);

  useEffect(() => { if (ready && session) { setRows(null); void load(); } }, [ready, session, load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || r.student_name.toLowerCase().includes(q));
  }, [rows, query]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    shown.forEach((r) => m.set(r.local_date, [...(m.get(r.local_date) ?? []), r]));
    return [...m.entries()];
  }, [shown]);

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/reports/attendance.csv?${qs}`, { headers: { authorization: `Bearer ${session!.token}` } });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `presencas-${from}_${to}.csv` });
      a.click(); URL.revokeObjectURL(url);
      show('Relatório exportado');
    } catch { show('Não foi possível exportar o relatório.', 'bad'); }
    setExporting(false);
  }

  const dayLabel = (d: string) => {
    const s = new Date(d + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <section>
      <PageHeader
        title="Histórico"
        subtitle="Entradas, almoços, saídas e ocorrências por dia."
        action={session?.user.role === 'admin' && (
          <button onClick={exportCsv} disabled={exporting} className="btn btn-primary">{exporting ? 'A exportar' : 'Exportar CSV'}</button>
        )}
      />

      <div className="card anim-rise mb-5 grid gap-3 p-4 sm:grid-cols-[repeat(2,minmax(0,150px))_minmax(0,180px)_1fr] sm:items-end" style={{ animationDelay: '40ms' }}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">De<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Até<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Tipo
          <select value={type} onChange={(e) => setType(e.target.value as '' | EvType)} className="input">
            <option value="">Todos</option>{(Object.keys(TYPE) as EvType[]).map((t) => <option key={t} value={t}>{TYPE[t].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Aluno<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar por nome" className="input" /></label>
      </div>

      {rows === null ? <div className="card"><SkeletonRows n={5} /></div>
        : byDay.length === 0 ? <div className="card"><Empty title="Sem registos neste período" hint="Mude as datas ou o tipo. Os toques no kiosk aparecem aqui assim que são enviados." /></div>
        : (
          <div className="flex flex-col gap-6">
            {byDay.map(([day, list], di) => (
              <div key={day} className="anim-rise" style={{ animationDelay: `${Math.min(di, 5) * 50}ms` }}>
                <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-muted">
                  {dayLabel(day)} <span className="font-normal normal-case">· {list.length} registos</span>
                </h2>
                <ul className="card overflow-hidden">
                  {list.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-0 hover:bg-surface-2/60">
                      <span className="w-12 font-mono text-sm tabular-nums text-muted">{r.local_time ?? '–'}</span>
                      <Avatar name={r.student_name} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.student_name}</p>
                        <p className="truncate text-xs text-muted">{r.class_name ?? 'Sem turma'}{r.note ? ` · ${r.note.replace(/^[a-z]+: /, '')}` : ''}</p>
                      </div>
                      {r.late ? <span className="pill" style={{ ['--tone' as string]: 'var(--late)' }}>Atraso</span> : null}
                      <span className="pill" style={{ ['--tone' as string]: TYPE[r.type].tone }}>{TYPE[r.type].label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {rows.length >= 400 && <p className="text-center text-sm text-muted">A mostrar os 400 registos mais recentes. Reduza o período ou exporte o relatório.</p>}
          </div>
        )}
      {node}
    </section>
  );
}
