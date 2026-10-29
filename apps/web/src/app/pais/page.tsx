'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { homeFor, logout, useSession } from '@/lib/auth';
import { Avatar, Spinner, Wordmark } from '@/components/ui';
import { Modal, useToast } from '@/components/kit';

interface Today { status: 'present' | 'late' | 'absent' | 'left'; late: boolean; entry_time: string | null; lunch_time: string | null; exit_time: string | null; incidents: number }
interface Child { id: number; name: string; photo_url: string | null; today: Today }
interface Ev { id: number; type: 'entry' | 'lunch' | 'exit' | 'incident'; note: string | null; late: number; tapped_at: string; local_time: string | null; local_date: string }
interface Me { name: string; consented: boolean; school_name: string | null }

const LABEL = { entry: 'Chegou à escola', lunch: 'Almoçou na cantina', exit: 'Saiu da escola', incident: 'Ocorrência' } as const;
const TONE = { entry: 'var(--ok)', lunch: 'var(--brand)', exit: 'var(--gone)', incident: 'var(--bad)' } as const;

// Data local do aparelho (em Cabo Verde, UTC-1), não a UTC.
const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const b64 = (s: string) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

type PushState = 'loading' | 'unsupported' | 'ios-install' | 'off' | 'denied' | 'on';

export default function Pais() {
  const { session, ready, call } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [children, setChildren] = useState<Child[] | null>(null);
  const [events, setEvents] = useState<Record<number, Ev[]>>({});
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [offline, setOffline] = useState(false);
  const [push, setPush] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const { show, node } = useToast();

  useEffect(() => {
    if (!ready) return;
    if (!session) window.location.replace('/');
    else if (session.user.role !== 'guardian') window.location.replace(homeFor(session.user.role));
  }, [ready, session]);

  const guardian = ready && session?.user.role === 'guardian';

  const load = useCallback(async () => {
    try {
      const kids = await call<Child[]>('/me/students');
      setChildren(kids);
      const from = localISO(new Date(range === 'today' ? Date.now() : Date.now() - 6 * 864e5));
      const all = await Promise.all(kids.map((k) => call<Ev[]>(`/me/students/${k.id}/events?from=${from}`)));
      setEvents(Object.fromEntries(kids.map((k, i) => [k.id, all[i]])));
      setOffline(false);
    } catch { setOffline(true); }
  }, [call, range]);

  useEffect(() => { if (guardian) void call<Me>('/me').then(setMe).catch(() => setOffline(true)); }, [guardian, call]);

  useEffect(() => {
    if (!guardian || !me?.consented) return;
    void load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [guardian, me?.consented, load]);

  // Estado das notificações neste aparelho.
  useEffect(() => {
    if (!guardian) return;
    (async () => {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (ios && !standalone) return setPush('ios-install');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setPush('unsupported');
      if (Notification.permission === 'denied') return setPush('denied');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPush(sub && Notification.permission === 'granted' ? 'on' : 'off');
    })().catch(() => setPush('unsupported'));
  }, [guardian]);

  async function enablePush() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPush(perm === 'denied' ? 'denied' : 'off'); setBusy(false); return; }
      const { key } = await call<{ key: string }>('/push/public-key');
      if (!key) throw new Error('no_key');
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) as unknown as BufferSource }));
      await call('/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
      setPush('on'); show('Notificações ativadas');
    } catch { show('Não foi possível ativar as notificações. Tente de novo.', 'bad'); }
    setBusy(false);
  }

  async function accept() {
    setBusy(true);
    try { await call('/me/consent', { method: 'POST' }); setMe((m) => (m ? { ...m, consented: true } : m)); }
    catch { show('Não foi possível guardar a sua aceitação. Tente de novo.', 'bad'); }
    setBusy(false);
  }

  const days = useMemo(() => (range === 'today' ? 1 : 7), [range]);
  if (!session || session.user.role !== 'guardian') return null;

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-12">
      <header className="flex items-center justify-between py-4">
        <Wordmark />
        <button onClick={logout} className="btn btn-ghost px-3 py-1.5 text-sm">Sair</button>
      </header>

      <h1 className="anim-rise font-display text-3xl sm:text-4xl">Olá, {session.user.name.split(' ')[0]}</h1>
      <p className="mb-6 mt-1 text-muted" role="status">{offline ? 'Sem ligação. A tentar de novo.' : me?.school_name ? `${me.school_name} · atualizado ao vivo` : 'Atualizado ao vivo'}</p>

      <NotifyCard state={push} busy={busy} onEnable={enablePush} />

      <div className="mb-4 inline-flex rounded-full border border-line bg-surface p-1" role="group" aria-label="Período">
        {([['today', 'Hoje'], ['week', 'Últimos 7 dias']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setRange(k)} aria-pressed={range === k} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${range === k ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink'}`}>{l}</button>
        ))}
      </div>

      {children === null ? (
        <div className="card p-5"><div className="skeleton h-5 w-40" /><div className="skeleton mt-4 h-4 w-56" /></div>
      ) : children.length === 0 ? (
        <p className="card p-6 text-sm text-muted">Ainda não há educandos ligados à sua conta. Fale com a secretaria da escola.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {children.map((k, i) => {
            const list = events[k.id] ?? [];
            const grouped = new Map<string, Ev[]>();
            [...list].reverse().forEach((e) => grouped.set(e.local_date, [...(grouped.get(e.local_date) ?? []), e]));
            return (
              <article key={k.id} className="card anim-rise p-5" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="mb-4 flex items-center gap-3"><Avatar name={k.name} src={k.photo_url} size={44} /><h2 className="font-display text-xl">{k.name}</h2></div>
                <DayStatus t={k.today} />
                {list.length === 0 ? (
                  <p className="text-sm text-muted">{range === 'today' ? 'Ainda sem registos hoje.' : `Sem registos nos últimos ${days} dias.`}</p>
                ) : (
                  <div className="flex flex-col gap-5">
                    {[...grouped.entries()].reverse().map(([day, evs]) => (
                      <div key={day}>
                        {range === 'week' && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{new Date(day + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
                        <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
                          {evs.map((ev) => (
                            <li key={ev.id} className="relative">
                              <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface" style={{ background: TONE[ev.type] }} aria-hidden />
                              <p className="font-medium">{LABEL[ev.type]}{ev.late ? ' · atrasado' : ''}</p>
                              <p className="font-mono text-xs text-muted">{ev.local_time ?? '–'}</p>
                              {ev.note && <p className="mt-1 text-sm text-muted">{ev.note.replace(/^[a-z]+: /, '')}</p>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {me && !me.consented && (
        <Modal title="Antes de começar" subtitle={me.school_name ?? undefined} onClose={() => {}}>
          <div className="flex flex-col gap-3 text-sm text-muted">
            <p>A escola usa o Prezenti para o avisar quando o seu educando <span className="text-ink">chega, almoça e sai</span>, e quando há uma ocorrência.</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>Guardamos só o nome, a turma e a hora dos registos.</li>
              <li>Só você e a escola veem estes dados.</li>
              <li>Pode pedir à secretaria para os apagar a qualquer momento.</li>
            </ul>
          </div>
          <button onClick={accept} disabled={busy} className="btn btn-primary h-12">{busy ? <><Spinner /> A guardar</> : 'Aceitar e continuar'}</button>
        </Modal>
      )}
      {node}
    </div>
  );
}

/** O que a família quer saber primeiro: chegou? atrasou? comeu? já saiu? */
function DayStatus({ t }: { t: Today }) {
  const main = t.status === 'left' ? { text: `Saiu da escola às ${t.exit_time}`, tone: 'var(--gone)' }
    : t.status === 'late' ? { text: `Chegou atrasado às ${t.entry_time}`, tone: 'var(--late)' }
    : t.status === 'present' ? { text: `Chegou bem às ${t.entry_time}`, tone: 'var(--ok)' }
    : { text: 'Ainda não chegou à escola', tone: 'var(--gone)' };
  const chips = [
    { label: 'Chegou', v: t.entry_time }, { label: 'Almoçou', v: t.lunch_time }, { label: 'Saiu', v: t.exit_time },
  ];
  return (
    <div className="mb-5 rounded-xl border border-line bg-surface-2/60 p-4">
      <p className="flex items-center gap-2 font-medium" style={{ color: main.tone }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: main.tone }} aria-hidden />{main.text}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <li key={c.label} className={`rounded-full border px-3 py-1 text-xs ${c.v ? 'border-brand/30 bg-brand-soft text-brand' : 'border-line text-muted'}`}>
            {c.label} <span className="font-mono tabular-nums">{c.v ?? '–'}</span>
          </li>
        ))}
        {t.incidents > 0 && <li className="rounded-full border border-bad/30 bg-bad-bg px-3 py-1 text-xs text-bad">{t.incidents === 1 ? '1 ocorrência hoje' : `${t.incidents} ocorrências hoje`}</li>}
      </ul>
    </div>
  );
}

function NotifyCard({ state, busy, onEnable }: { state: PushState; busy: boolean; onEnable: () => void }) {
  if (state === 'loading' || state === 'unsupported') return null;
  if (state === 'on') {
    return <p className="mb-4 flex items-center gap-2 text-sm text-ok"><span className="h-2 w-2 rounded-full bg-ok" aria-hidden /> Notificações ativas neste aparelho</p>;
  }
  return (
    <div className="card anim-rise mb-5 border-brand/30 bg-brand-soft/60 p-5">
      {state === 'ios-install' ? (
        <>
          <h2 className="font-display text-lg">Instale o Prezenti para receber avisos</h2>
          <p className="mt-1 text-sm text-muted">No iPhone, os avisos só chegam com o app no ecrã principal.</p>
          <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
            <li>Toque em <span className="font-semibold">Partilhar</span> (o quadrado com a seta) no Safari.</li>
            <li>Escolha <span className="font-semibold">Adicionar ao ecrã principal</span>.</li>
            <li>Abra o Prezenti pelo novo ícone e ative as notificações.</li>
          </ol>
        </>
      ) : state === 'denied' ? (
        <>
          <h2 className="font-display text-lg">As notificações estão bloqueadas</h2>
          <p className="mt-1 text-sm text-muted">Permita-as nas definições do navegador para este site e volte a abrir esta página.</p>
        </>
      ) : (
        <>
          <h2 className="font-display text-lg">Receba o aviso quando chegarem</h2>
          <p className="mt-1 text-sm text-muted">Ative as notificações para saber, em segundos, quando o seu educando chega, almoça e sai.</p>
          <button onClick={onEnable} disabled={busy} className="btn btn-primary mt-4">{busy ? <><Spinner /> A ativar</> : 'Ativar notificações'}</button>
        </>
      )}
    </div>
  );
}
