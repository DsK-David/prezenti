'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth';
import { Avatar, Spinner } from '@/components/ui';
import { STATUS, type Status, type TodayRow as Row } from '@/lib/status';
import { Overview, type Stats } from '@/components/overview';
import { IncidentDialog, Steps } from '@/components/roster';
import { TeacherHome } from '@/components/teacher-home';
import { LivePulse } from '@/components/ui';

type Filter = Status | 'all';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todos' }, { key: 'present', label: 'Presentes' }, { key: 'late', label: 'Atrasados' },
  { key: 'absent', label: 'Ausentes' }, { key: 'left', label: 'Já saíram' },
];

/** Gestor: visão da escola com gráficos. Professor: as suas turmas. */
export default function Hoje() {
  const { session, ready } = useSession();
  if (!ready || !session) return null;
  return session.user.role === 'teacher' ? <TeacherHome /> : <AdminHoje />;
}

function AdminHoje() {
  const { session, ready, call } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [klass, setKlass] = useState('');
  const [offline, setOffline] = useState(false);
  const [incident, setIncident] = useState<Row | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, st] = await Promise.all([call<Row[]>('/school/today'), call<Stats>('/stats/overview?days=14')]);
      setRows(r); setStats(st); setOffline(false);
    } catch { setOffline(true); }
  }, [call]);

  // Atualização a cada 10 s; realtime fica para depois do piloto.
  useEffect(() => {
    if (!ready || !session) return;
    void load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [ready, session, load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  const counts = useMemo(() => {
    const c = { all: rows?.length ?? 0, present: 0, late: 0, absent: 0, left: 0 };
    rows?.forEach((r) => c[r.status]++);
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => (filter === 'all' || r.status === filter) && (!klass || r.class_name === klass) && (!q || r.name.toLowerCase().includes(q)));
  }, [rows, filter, query, klass]);
  const klasses = useMemo(() => [...new Set((rows ?? []).map((r) => r.class_name).filter(Boolean))] as string[], [rows]);

  const todayRaw = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 19 ? 'Boa tarde' : 'Boa noite';
  const first = session?.user.name.split(' ')[0];

  return (
    <section className="flex flex-col gap-6">
      <div className="anim-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{today}</p>
          <h1 className="font-display text-3xl sm:text-4xl">{greeting}{first ? `, ${first}` : ''}</h1>
        </div>
        <LivePulse off={offline} label={offline ? 'Sem ligação, a tentar de novo' : 'Ao vivo'} />
      </div>

      <Overview rows={rows} stats={stats} />

      <h2 className="font-display text-xl">Alunos</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${on ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line bg-surface text-muted hover:text-ink'}`}
              >
                {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          {klasses.length > 1 && (
            <select value={klass} onChange={(e) => setKlass(e.target.value)} aria-label="Filtrar por turma" className="input w-auto py-2">
              <option value="">Todas as turmas</option>{klasses.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar aluno" aria-label="Procurar aluno" className="input max-w-56 py-2" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows === null ? (
          <ul>{Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-4 border-b border-line p-4 last:border-0">
              <div className="skeleton h-9 w-9 rounded-full" /><div className="skeleton h-4 w-40" /><div className="skeleton ml-auto h-4 w-24" />
            </li>
          ))}</ul>
        ) : shown.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium">{rows.length === 0 ? 'Ainda não há alunos nesta lista' : 'Nenhum aluno corresponde ao filtro'}</p>
            <p className="mt-1 text-sm text-muted">{rows.length === 0 ? 'Peça ao gestor para adicionar alunos e associar cartões.' : 'Mude o filtro ou limpe a pesquisa.'}</p>
          </div>
        ) : (
          <ul>
            {shown.map((r, i) => (
              <li
                key={r.id}
                className="anim-rise grid items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-0 hover:bg-surface-2/60 sm:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1.4fr)_auto]"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={r.name} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted">{r.class_name ?? 'Sem turma'}</p>
                  </div>
                </div>
                <span className="pill w-fit" style={{ ['--tone' as string]: STATUS[r.status].tone }}>{STATUS[r.status].label}</span>
                <Steps entry={r.entry_time} lunch={r.lunch} exit={r.exit_time} />
                <button onClick={() => setIncident(r)} className="btn btn-quiet justify-self-start sm:justify-self-end">Registar ocorrência</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {incident && (
        <IncidentDialog
          student={incident}
          call={call}
          onClose={() => setIncident(null)}
          onDone={() => { setIncident(null); setToast(`Ocorrência registada para ${incident.name.split(' ')[0]}`); }}
        />
      )}
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-30 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink shadow-[0_12px_32px_-12px_rgb(26_34_51/0.25)]" style={{ animation: 'toast 2.8s var(--ease) both' }}>
          {toast}
        </div>
      )}
    </section>
  );
}
