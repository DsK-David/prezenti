'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';
import { NFC_ERRORS, NFC_SUPPORT_TEXT, nfcPermission, nfcSupport, startNfc, useNfcSupport } from '@/lib/nfc';
import { Avatar, RingMark, Rings, Spinner } from '@/components/ui';

type TapResponse =
  | { status: 'ok'; type: 'entry' | 'lunch' | 'exit'; late: boolean; student: { name: string; photo_url: string | null } }
  | { status: 'duplicate'; reason: string; student?: { name: string; photo_url: string | null } }
  | { status: 'unknown_card' };

interface QueuedTap { client_id: string; card_uid: string; tapped_at: string }
interface DeviceInfo { name: string; location: 'gate' | 'canteen'; school_name: string; school_active: boolean }

const QUEUE_KEY = 'prezenti.queue';
const TOKEN_KEY = 'prezenti.deviceToken';
const LABEL = { entry: 'ENTRADA', lunch: 'ALMOÇO', exit: 'SAÍDA' } as const;
const PLACE = { gate: 'Portaria', canteen: 'Cantina' } as const;
// O mesmo cartão encostado duas vezes seguidas conta uma só vez (o servidor também filtra).
const SAME_CARD_MS = 3000;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};
const readQueue = (): QueuedTap[] => { try { return JSON.parse(store.get(QUEUE_KEY) ?? '[]'); } catch { return []; } };
const writeQueue = (q: QueuedTap[]) => store.set(QUEUE_KEY, JSON.stringify(q));

class TokenError extends Error {}

async function send(token: string, tap: QueuedTap): Promise<TapResponse> {
  const res = await fetch(`${API_URL}/tap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-token': token },
    body: JSON.stringify(tap),
  });
  if (res.status === 401) throw new TokenError();
  if (!res.ok) throw new Error('server');
  return res.json();
}

async function fetchDevice(token: string): Promise<DeviceInfo> {
  const res = await fetch(`${API_URL}/device/me`, { headers: { 'x-device-token': token } });
  if (res.status === 401) throw new TokenError();
  if (!res.ok) throw new Error('server');
  return res.json();
}

/** Som curto e vibração: quem está na portaria percebe o resultado sem olhar para o ecrã. */
function useFeedback() {
  const ctx = useRef<AudioContext | null>(null);
  const unlock = useCallback(() => {
    try { ctx.current ??= new AudioContext(); void ctx.current.resume(); } catch {}
  }, []);
  const play = useCallback((kind: 'ok' | 'late' | 'bad' | 'soft') => {
    const pattern = { ok: [60], late: [60, 80, 60], bad: [200, 80, 200], soft: [30] }[kind];
    navigator.vibrate?.(pattern);
    const a = ctx.current;
    if (!a || a.state !== 'running') return;
    const notes = { ok: [880], late: [660, 880], bad: [220, 180], soft: [520] }[kind];
    notes.forEach((f, i) => {
      const o = a.createOscillator(); const g = a.createGain();
      o.frequency.value = f; o.type = 'sine';
      const t = a.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.13);
    });
  }, []);
  return { unlock, play };
}

export default function Kiosk() {
  const support = useNfcSupport();
  const [token, setToken] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<TapResponse | null>(null);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [tapKey, setTapKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [checking, setChecking] = useState(false);
  const clear = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scan = useRef<AbortController | null>(null);
  const last = useRef<{ uid: string; at: number } | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const { unlock, play } = useFeedback();

  const forget = useCallback((message: string) => {
    scan.current?.abort(); scan.current = null;
    store.del(TOKEN_KEY);
    setToken(null); setDevice(null); setReading(false); setNotice(message);
  }, []);

  const flush = useCallback(async () => {
    const t = store.get(TOKEN_KEY);
    if (!t) return;
    let q = readQueue();
    while (q.length) {
      try { await send(t, q[0]); } catch (e) { if (e instanceof TokenError) forget('O token deste aparelho foi desativado. Peça um novo ao gestor.'); break; }
      q = q.slice(1);
      writeQueue(q);
    }
    setPending(q.length);
  }, [forget]);

  const show = useCallback((r: TapResponse) => {
    setResult(r);
    setTapKey((k) => k + 1);
    clearTimeout(clear.current);
    clear.current = setTimeout(() => setResult(null), 4000);
    play(r.status === 'ok' ? (r.late ? 'late' : 'ok') : r.status === 'unknown_card' ? 'bad' : 'soft');
  }, [play]);

  const onCard = useCallback(async (uid: string) => {
    const t = store.get(TOKEN_KEY);
    if (!t) return;
    const now = Date.now();
    if (last.current && last.current.uid === uid && now - last.current.at < SAME_CARD_MS) return;
    last.current = { uid, at: now };
    const tap: QueuedTap = { client_id: crypto.randomUUID(), card_uid: uid, tapped_at: new Date().toISOString() };
    try {
      show(await send(t, tap));
      void flush();
    } catch (e) {
      if (e instanceof TokenError) return forget('O token deste aparelho foi desativado. Peça um novo ao gestor.');
      // Sem rede: guarda e reenvia depois. O client_id evita duplicados no servidor.
      writeQueue([...readQueue(), tap]);
      setPending(readQueue().length);
      show({ status: 'duplicate', reason: 'offline' });
    }
  }, [flush, forget, show]);

  const keepAwake = useCallback(async () => {
    try { wake.current = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch {}
  }, []);

  const start = useCallback(async () => {
    setError(null);
    scan.current?.abort();
    const ctrl = new AbortController();
    scan.current = ctrl;
    const err = await startNfc({
      signal: ctrl.signal,
      onCard: (uid) => void onCard(uid),
      onUnreadable: () => { setError('Cartão não lido. Encoste-o de novo, parado, atrás do telemóvel.'); play('soft'); },
    });
    if (err) { setReading(false); setError(NFC_ERRORS[err]); return; }
    setReading(true);
    void keepAwake();
  }, [onCard, keepAwake, play]);

  // Arranque: token guardado → confirma-o e, se o Chrome já deu permissão ao NFC, começa a ler sozinho.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = store.get(TOKEN_KEY);
      setPending(readQueue().length);
      if (!t) { setBooting(false); return; }
      setToken(t);
      try {
        const info = await fetchDevice(t);
        if (cancelled) return;
        setDevice(info);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof TokenError) { forget('O token deste aparelho deixou de ser válido. Peça um novo ao gestor.'); setBooting(false); return; }
        // Sem rede ao abrir: continua a funcionar e guarda os toques.
      }
      setBooting(false);
      if (nfcSupport() === 'ok' && (await nfcPermission()) === 'granted' && !cancelled) void start();
    })();
    return () => { cancelled = true; };
    // Só ao abrir o kiosk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rede: reenvia a fila quando volta, e de 30 em 30 s.
  useEffect(() => {
    const up = () => { setOnline(true); void flush(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const id = setInterval(flush, 30_000);
    const sync = setTimeout(() => setOnline(navigator.onLine), 0);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); clearInterval(id); clearTimeout(sync); };
  }, [flush]);

  // O Android liberta o ecrã ligado quando a app sai do primeiro plano; pede-o de novo ao voltar.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && reading) void keepAwake(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reading, keepAwake]);

  useEffect(() => () => { scan.current?.abort(); void wake.current?.release().catch(() => {}); }, []);

  async function configure(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get('token') ?? '').trim();
    if (!v) return;
    setError(null); setNotice(null); setChecking(true);
    try {
      const info = await fetchDevice(v);
      store.set(TOKEN_KEY, v);
      setToken(v); setDevice(info);
    } catch (err) {
      setError(err instanceof TokenError ? 'Token inválido. Confirme que copiou o token inteiro do painel, em Dispositivos.' : 'Sem ligação ao servidor. Verifique a internet e tente de novo.');
    }
    setChecking(false);
  }

  if (booting) {
    return <main className="flex min-h-dvh items-center justify-center text-brand"><span className="anim-blink"><RingMark size={44} /></span></main>;
  }

  if (!token) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <form className="card anim-pop flex w-full max-w-sm flex-col gap-4 p-6" onSubmit={configure}>
          <span className="text-brand"><RingMark size={36} /></span>
          <div>
            <h1 className="font-display text-title1">Configurar kiosk</h1>
            <p className="mt-1 text-body text-muted">Cole o token que o gestor criou para este aparelho em Dispositivos.</p>
          </div>
          {notice && <p role="status" className="rounded-lg bg-late-bg px-3 py-2 text-footnote text-late">{notice}</p>}
          <input name="token" required autoFocus autoComplete="off" spellCheck={false} placeholder="Token do dispositivo" className="input font-mono" />
          {error && <p role="alert" className="text-footnote text-bad">{error}</p>}
          <button disabled={checking} className="btn btn-primary py-3">{checking ? <><Spinner /> A confirmar</> : 'Guardar e continuar'}</button>
          {support !== 'ok' && <p className="text-footnote text-muted">{NFC_SUPPORT_TEXT[support]}</p>}
        </form>
      </main>
    );
  }

  const ok = result?.status === 'ok' ? result : null;
  // Fundo claro com um véu da cor do resultado; a cor forte fica só no rótulo.
  const tone = ok ? (ok.late ? 'var(--late)' : 'var(--ok)') : result?.status === 'unknown_card' ? 'var(--bad)' : result ? 'var(--gone)' : 'var(--brand)';
  const veil = result ? `color-mix(in oklab, ${tone} 11%, white)` : 'var(--bg)';

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-8 text-ink transition-colors duration-300" style={{ background: veil }}>
      <header className="absolute inset-x-4 top-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pl-2 pr-3.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-white"><RingMark size={16} /></span>
          <span className="min-w-0 truncate text-footnote">
            <span className="font-semibold text-ink">{device ? PLACE[device.location] : 'Kiosk'}</span>
            {device && <span className="text-muted"> · {device.school_name}</span>}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-footnote text-muted" role="status">
          <span className={`h-2 w-2 rounded-full ${online ? 'bg-ok' : 'anim-blink bg-late'}`} aria-hidden />
          {online ? 'Online' : 'Sem rede'}{pending > 0 && ` · ${pending} por enviar`}
        </div>
      </header>

      {/* A onda expande a partir do centro a cada toque: o feedback é o próprio gesto. */}
      {result && (
        <span key={tapKey} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]" style={{ borderColor: tone, animation: 'burst 900ms var(--ease-out) both' }} />
      )}

      {support !== 'ok' ? (
        <div className="anim-rise flex max-w-md flex-col items-center gap-4 text-center">
          <span className="text-bad"><RingMark size={48} /></span>
          <h1 className="font-display text-4xl">Este aparelho não lê cartões</h1>
          <p className="text-lg text-muted">{NFC_SUPPORT_TEXT[support]}</p>
        </div>
      ) : !reading ? (
        <div className="anim-rise flex max-w-md flex-col items-center gap-6 text-center">
          <span className="text-brand"><RingMark size={56} /></span>
          <div>
            <h1 className="font-display text-5xl">{device?.name ?? 'Kiosk pronto'}</h1>
            <p className="mt-2 text-lg text-muted">Na primeira vez o Android pede autorização para usar o NFC. Depois, o kiosk começa a ler sozinho ao abrir.</p>
          </div>
          <button onClick={() => { unlock(); void start(); }} className="btn btn-primary px-8 py-4 text-lg">Iniciar leitura</button>
        </div>
      ) : ok ? (
        <div key={tapKey} className="anim-pop flex flex-col items-center gap-5 text-center">
          <Avatar name={ok.student.name} src={ok.student.photo_url} size={176} />
          <p className="font-display text-6xl leading-tight sm:text-7xl">{ok.student.name}</p>
          <p className="rounded-full px-7 py-2.5 text-2xl font-semibold tracking-wide text-white" style={{ background: tone }}>
            {LABEL[ok.type]}{ok.late ? ' · atrasado' : ''}
          </p>
        </div>
      ) : result?.status === 'unknown_card' ? (
        <div key={tapKey} className="anim-shake flex flex-col items-center gap-3 text-center">
          <p className="font-display text-6xl">Cartão não reconhecido</p>
          <p className="text-2xl text-muted">Fale com a secretaria para o associar.</p>
        </div>
      ) : result ? (
        <div key={tapKey} className="anim-pop flex flex-col items-center gap-3 text-center">
          <p className="font-display text-5xl">{result.student ? result.student.name : 'Toque guardado'}</p>
          <p className="text-2xl text-muted">{result.student ? 'Já registado, não precisa de tocar de novo.' : 'Sem rede. Será enviado quando voltar.'}</p>
        </div>
      ) : (
        <div className="relative flex h-[380px] w-[380px] max-w-full items-center justify-center text-brand/40">
          <div className="absolute inset-0 flex items-center justify-center"><Rings size={380} count={3} /></div>
          <p className="relative text-center font-display text-6xl text-ink">Encoste o cartão</p>
        </div>
      )}

      {error && <p role="alert" className="absolute bottom-20 mx-4 rounded-lg bg-bad-bg px-4 py-2 text-center text-body text-bad">{error}</p>}

      <footer className="absolute inset-x-4 bottom-4 flex justify-end">
        {confirmReset ? (
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-3.5 pr-1 text-footnote">
            <span className="text-muted">Desligar este aparelho do kiosk?</span>
            <button onClick={() => setConfirmReset(false)} className="btn btn-ghost px-3 py-1 text-footnote">Não</button>
            <button onClick={() => { setConfirmReset(false); forget('Aparelho desligado. Cole um token para o voltar a configurar.'); }} className="btn bg-bad px-3 py-1 text-footnote text-white">Desligar</button>
          </div>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="rounded-full px-3 py-1.5 text-footnote text-muted hover:bg-surface hover:text-ink">Trocar dispositivo</button>
        )}
      </footer>
    </main>
  );
}
