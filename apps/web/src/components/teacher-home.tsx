'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth';
import { STATUS, type Status } from '@/lib/status';
import { Avatar, LivePulse, RingMark } from './ui';
import { Empty, useToast } from './kit';
import { IncidentDialog, PresenceDots, Steps, type HistoryStatus } from './roster';

interface ClassRow { id: number; name: string; students: number }
interface Student {
  id: number; name: string; photo_url: string | null; status: Status; late: boolean;
  entry_time: string | null; lunch_time: string | null; exit_time: string | null; incidents: number;
  history: { date: string; status: HistoryStatus }[];
}
interface Attendance { class: { id: number; name: string }; late_after: string; days: string[]; students: Student[] }
type Filter = Status | 'all';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todos' }, { key: 'present', label: 'Presentes' }, { key: 'late', label: 'Atrasados' },
  { key: 'absent', label: 'Ainda não chegaram' }, { key: 'left', label: 'Já saíram' },
];

/** Vista do professor: as suas turmas, quem já chegou, a lista de alunos e a presença dos últimos dias. */
export function TeacherHome() {
  const { session, ready, call } = useSession();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [data, setData] = useState<Record<number, Attendance>>({});
  const [active, setActive] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [offline, setOffline] = useState(false);
  const [incident, setIncident] = useState<Student | null>(null);
  const { show, node } = useToast();

  const load = useCallback(async () => {
    try {
      const cls = await call<ClassRow[]>('/classes');
      const all = await Promise.all(cls.map((c) => call<Attendance>(`/classes/${c.id}/attendance?days=10`)));
      setClasses(cls);
      setData(Object.fromEntries(all.map((a) => [a.class.id, a])));
      setActive((cur) => (cur && cls.some((c) => c.id === cur) ? cur : cls[0]?.id ?? null));
      setOffline(false);
    } catch { setOffline(true); }
  }, [call]);

  useEffect(() => {
    if (!ready || !session) return;
    void load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [ready, session, load]);

  const cur = active ? data[active] : undefined;
  const counts = useMemo(() => {
    const c = { all: 0, present: 0, late: 0, absent: 0, left: 0 };
    cur?.students.forEach((s) => { c.all++; c[s.status]++; });
    return c;
  }, [cur]);
  const shown = (cur?.students ?? []).filter((s) => filter === 'all' || s.status === filter);
  const here = counts.present + counts.late;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 19 ? 'Boa tarde' : 'Boa noite';
  const dateRaw = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section className="flex flex-col gap-6">
      <div className="anim-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1)}</p>
          <h1 className="font-display text-3xl sm:text-4xl">{greeting}, {session?.user.name.split(' ')[0]}</h1>
        </div>
        <LivePulse off={offline} label={offline ? 'Sem ligação, a tentar de novo' : 'Ao vivo'} />
      </div>

      {classes === null ? (
        <div className="card skeleton h-64" aria-busy="true" />
      ) : classes.length === 0 ? (
        <div className="card"><Empty title="Ainda não tem turmas atribuídas" hint="O gestor da escola atribui-lhe as turmas. Assim que isso acontecer, os alunos e as presenças aparecem aqui." /></div>
      ) : (
        <>
          {classes.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="As minhas turmas">
              {classes.map((c) => {
                const a = data[c.id];
                const arrived = a ? a.students.filter((s) => s.status !== 'absent').length : 0;
                const on = c.id === active;
                return (
                  <button key={c.id} role="tab" aria-selected={on} onClick={() => { setActive(c.id); setFilter('all'); }}
                    className={`rounded-xl border px-4 py-2 text-left transition-colors ${on ? 'border-brand/40 bg-brand-soft' : 'border-line bg-surface hover:bg-surface-2'}`}>
                    <span className={`block font-display text-lg leading-tight ${on ? 'text-brand' : ''}`}>{c.name}</span>
                    <span className="text-xs tabular-nums text-muted">{arrived} de {a?.students.length ?? c.students} chegaram</span>
                  </button>
                );
              })}
            </div>
          )}

          {cur && (
            <>
              {/* Resumo da turma: quantos chegaram e quem falta. */}
              <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-linear-to-br from-[#2a52e0] via-[#3461ee] to-[#4a78f5] p-6 text-white anim-rise" style={{ boxShadow: '0 28px 56px -28px rgb(42 82 224 / 0.6)' }}>
                <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 text-white/[0.16]"><RingMark size={190} /></div>
                <p className="relative text-sm font-medium text-white/80">{cur.class.name}</p>
                <p className="relative mt-1 flex items-baseline gap-3">
                  <span className="font-display text-[clamp(3.5rem,8vw,5.5rem)] leading-none">{here}</span>
                  <span className="text-lg text-white/80">de {counts.all} {counts.all === 1 ? 'aluno' : 'alunos'} na escola</span>
                </p>
                <p className="relative mt-3 font-display text-xl text-accent">
                  {counts.all === 0 ? 'Esta turma ainda não tem alunos.' : counts.absent === 0 ? 'Todos chegaram bem.' : `Ainda não chegaram: ${counts.absent}.`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar alunos por estado">
                {FILTERS.map((f) => {
                  const on = filter === f.key;
                  return (
                    <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={on}
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${on ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line bg-surface text-muted hover:text-ink'}`}>
                      {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="card overflow-hidden">
                {shown.length === 0 ? (
                  <Empty title={counts.all === 0 ? 'Sem alunos nesta turma' : 'Nenhum aluno neste filtro'} hint={counts.all === 0 ? 'O gestor adiciona os alunos à turma.' : 'Mude o filtro acima.'} />
                ) : (
                  <ul>
                    {shown.map((s, i) => (
                      <li key={s.id} className="anim-rise grid items-center gap-x-4 gap-y-2.5 border-b border-line px-4 py-3.5 last:border-0 hover:bg-surface-2/60 lg:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1.3fr)_auto_auto]" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={s.name} src={s.photo_url} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{s.name}</p>
                            {s.incidents > 0 && <p className="text-xs text-bad">{s.incidents} {s.incidents === 1 ? 'ocorrência' : 'ocorrências'} hoje</p>}
                          </div>
                        </div>
                        <span className="pill w-fit" style={{ ['--tone' as string]: STATUS[s.status].tone }}>{s.status === 'absent' ? 'Ainda não chegou' : STATUS[s.status].label}</span>
                        <Steps entry={s.entry_time} lunch={s.lunch_time} exit={s.exit_time} />
                        <PresenceDots history={s.history} />
                        <button onClick={() => setIncident(s)} className="btn btn-quiet justify-self-start lg:justify-self-end">Registar ocorrência</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-muted">Presença dos últimos dias letivos: ponto cheio veio, âmbar chegou atrasado, aro faltou. Atraso a partir das {cur.late_after}.</p>
            </>
          )}
        </>
      )}

      {incident && <IncidentDialog student={incident} call={call} onClose={() => setIncident(null)} onDone={() => { setIncident(null); show(`Ocorrência registada para ${incident.name.split(' ')[0]}`); void load(); }} />}
      {node}
    </section>
  );
}
