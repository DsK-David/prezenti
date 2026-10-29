'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/auth';
import type { TodayRow as Row } from '@/lib/status';
import { Overview, type Stats } from '@/components/overview';
import { IncidentDialog } from '@/components/roster';
import { TodayTable } from '@/components/today-table';
import { TeacherHome } from '@/components/teacher-home';
import { LivePulse } from '@/components/ui';

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
          <h1 className="font-display text-title1">{greeting}{first ? `, ${first}` : ''}</h1>
        </div>
        <LivePulse off={offline} label={offline ? 'Sem ligação, a tentar de novo' : 'Ao vivo'} />
      </div>

      <Overview rows={rows} stats={stats} />

      <TodayTable rows={rows} lateAfter={stats?.late_after} onIncident={setIncident} />

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
