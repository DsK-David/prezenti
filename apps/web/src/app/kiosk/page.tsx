'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';
import { Avatar, RingMark, Rings } from '@/components/ui';

type TapResponse =
  | { status: 'ok'; type: 'entry' | 'lunch' | 'exit'; late: boolean; student: { name: string; photo_url: string | null } }
  | { status: 'duplicate'; reason: string; student?: { name: string; photo_url: string | null } }
  | { status: 'unknown_card' };

interface QueuedTap { client_id: string; card_uid: string; tapped_at: string }

const QUEUE_KEY = 'prezenti.queue';
const TOKEN_KEY = 'prezenti.deviceToken';
const LABEL = { entry: 'ENTRADA', lunch: 'ALMOÇO', exit: 'SAÍDA' } as const;

const readQueue = (): QueuedTap[] => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); } catch { return []; }
};
const writeQueue = (q: QueuedTap[]) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));

async function send(token: string, tap: QueuedTap): Promise<TapResponse> {
  const res = await fetch(`${API_URL}/tap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-token': token },
    body: JSON.stringify(tap),
  });
  if (res.status === 401) throw new Error('token');
  if (!res.ok) throw new Error('server');
  return res.json();
}

export default function Kiosk() {
  const [token, setToken] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<TapResponse | null>(null);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [tapKey, setTapKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const clear = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setToken(localStorage.getItem(TOKEN_KEY));
    setPending(readQueue().length);
  }, []);

  const flush = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return;
    let q = readQueue();
    while (q.length) {
      try { await send(t, q[0]); } catch { break; }
      q = q.slice(1);
      writeQueue(q);
    }
    setPending(q.length);
  }, []);

  const show = useCallback((r: TapResponse) => {
    setResult(r);
    setTapKey((k) => k + 1);
    clearTimeout(clear.current);
    clear.current = setTimeout(() => setResult(null), 4000);
  }, []);

  const onTap = useCallback(async (serial: string) => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return;
    const tap: QueuedTap = {
      client_id: crypto.randomUUID(),
      card_uid: serial.replace(/:/g, '').toUpperCase(),
      tapped_at: new Date().toISOString(),
    };
    try {
      show(await send(t, tap));
      void flush();
    } catch (e) {
      if ((e as Error).message === 'token') return setError('Token do dispositivo inválido');
      // Sem rede: guarda e reenvia depois. O client_id evita duplicados no servidor.
      writeQueue([...readQueue(), tap]);
      setPending(readQueue().length);
      setResult({ status: 'duplicate', reason: 'offline' });
    }
  }, [flush, show]);

  // O Web NFC exige um gesto do utilizador para iniciar a leitura.
  const start = async () => {
    setError(null);
    if (!('NDEFReader' in window)) return setError('Este navegador não suporta NFC. Use Chrome no Android.');
    try {
      const reader = new (window as any).NDEFReader();
      await reader.scan();
      reader.onreading = (e: any) => void onTap(e.serialNumber);
      reader.onreadingerror = () => setError('Cartão não lido, tente de novo');
      setStarted(true);
      // Mantém o ecrã ligado enquanto o kiosk está ativo.
      await (navigator as any).wakeLock?.request('screen').catch(() => {});
    } catch (e) {
      setError(`NFC indisponível: ${(e as Error).message}`);
    }
  };

  useEffect(() => {
    const up = () => { setOnline(true); void flush(); };
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const id = setInterval(flush, 30_000);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); clearInterval(id); };
  }, [flush]);

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <form
          className="card anim-pop flex w-full max-w-sm flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const v = (new FormData(e.currentTarget).get('token') as string).trim();
            localStorage.setItem(TOKEN_KEY, v);
            setToken(v);
          }}
        >
          <span className="text-brand"><RingMark size={36} /></span>
          <div>
            <h1 className="font-display text-2xl font-semibold">Configurar kiosk</h1>
            <p className="mt-1 text-sm text-muted">Cole o token que o gestor criou para este aparelho.</p>
          </div>
          <input name="token" required autoFocus placeholder="Token do dispositivo" className="input font-mono" />
          <button className="btn btn-primary py-3">Guardar e continuar</button>
        </form>
      </main>
    );
  }

  const ok = result?.status === 'ok' ? result : null;
  // Fundo claro com um véu da cor do resultado; a cor forte fica só no rótulo.
  const tone = ok ? (ok.late ? 'var(--late)' : 'var(--ok)') : result?.status === 'unknown_card' ? 'var(--bad)' : result ? 'var(--gone)' : 'var(--brand)';
  const veil = result ? `color-mix(in oklab, ${tone} 11%, white)` : 'var(--bg)';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-8 text-ink transition-colors duration-300" style={{ background: veil }}>
      <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted" role="status">
        <span className={`h-2 w-2 rounded-full ${online ? 'bg-ok' : 'anim-blink bg-late'}`} aria-hidden />
        {online ? 'Online' : 'Sem rede'}{pending > 0 && ` · ${pending} por enviar`}
      </div>

      {/* A onda expande a partir do centro a cada toque: o feedback é o próprio gesto. */}
      {result && (
        <span key={tapKey} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]" style={{ borderColor: tone, animation: 'burst 900ms var(--ease-out) both' }} />
      )}

      {!started ? (
        <div className="anim-rise flex max-w-md flex-col items-center gap-6 text-center">
          <span className="text-brand"><RingMark size={56} /></span>
          <div>
            <h1 className="font-display text-5xl">Kiosk pronto</h1>
            <p className="mt-2 text-muted">O Android pede uma permissão para ler cartões. Toque no botão e deixe o ecrã ligado.</p>
          </div>
          <button onClick={start} className="btn btn-primary px-8 py-4 text-lg">Iniciar leitura</button>
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
        <div className="relative flex h-[380px] w-[380px] items-center justify-center text-brand/40">
          <div className="absolute inset-0"><Rings size={380} count={3} /></div>
          <p className="relative text-center font-display text-6xl text-ink">Encoste o cartão</p>
        </div>
      )}

      {error && <p role="alert" className="absolute bottom-6 rounded-lg bg-bad-bg px-4 py-2 text-sm text-bad">{error}</p>}
    </main>
  );
}
