'use client';

import { useEffect, useState } from 'react';
import { homeFor, loadSession, login } from '@/lib/auth';
import { NfcScene, RingMark, Rings, Spinner } from '@/components/ui';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Utilizador ou senha incorretos. Confirme os dados e tente de novo.',
  validation: 'Preencha o utilizador e a senha.',
  too_many_attempts: 'Demasiadas tentativas falhadas. Espere 15 minutos ou peça uma senha nova à secretaria.',
};

const POINTS = ['Entrada, almoço e saída em segundos', 'Aviso direto no telemóvel da família', 'Continua a registar sem internet'];

// Contas do seed de demonstração (todas com a mesma senha): um toque entra.
const DEMO_PASSWORD = 'prezenti123';
const DEMO_ACCOUNTS = [
  { username: 'super', label: 'Super admin' },
  { username: 'admin1', label: 'Gestor 1' },
  { username: 'prof1', label: 'Professor 1' },
  { username: 'pai1', label: 'Pai 1' },
  { username: 'admin2', label: 'Gestor 2' },
  { username: 'prof2', label: 'Professor 2' },
  { username: 'pai2', label: 'Pai 2' },
];

// Altura baixa (portátil pequeno, telemóvel deitado): corta o que é só decoração, nunca o formulário.
const TALL = '[@media(max-height:760px)]:hidden';

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(true);

  // Com sessão guardada, a raiz leva logo à área de cada perfil (sem mostrar o formulário).
  useEffect(() => {
    const s = loadSession();
    if (s) window.location.replace(homeFor(s.user.role));
    else setChecking(false);
  }, []);

  async function signIn(username: string, password: string) {
    setError(null);
    setBusy(true);
    try {
      const { user } = await login(username, password);
      window.location.href = homeFor(user.role);
    } catch (err) {
      setError(MESSAGES[(err as Error).message] ?? 'Sem ligação ao servidor. Verifique a internet e tente de novo.');
      setShake((n) => n + 1);
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void signIn(String(f.get('username')), String(f.get('password')));
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center text-brand">
        <span className="anim-blink"><RingMark size={44} /></span>
      </main>
    );
  }

  // h-dvh + overflow-hidden: a tela nunca rola. Painel de marca ~58% / formulário ~42% (arquitetura do login do ilhapay).
  return (
    <main className="flex h-dvh flex-col overflow-hidden lg:grid lg:grid-cols-[58fr_42fr]">
      <section className="relative flex shrink-0 flex-col justify-between overflow-hidden bg-linear-to-br from-[#2a52e0] via-[#3461ee] to-[#4a78f5] px-7 pb-10 pt-6 text-white lg:min-h-0 lg:shrink lg:px-14 lg:py-10">
        <div className="relative z-10 flex items-center gap-2 font-display text-xl lg:text-2xl"><RingMark size={28} /> Prezenti</div>

        <div className="relative hidden min-h-0 flex-1 items-center justify-center text-white/25 lg:flex">
          <Rings size={400} count={4} />
          {/* A cena é o herói: encolhe em janelas baixas e só some quando não há mesmo espaço. */}
          <NfcScene className="absolute [@media(max-height:760px)]:scale-[0.82] [@media(max-height:640px)]:hidden" />
        </div>

        <div className="anim-rise relative z-10 mt-5 lg:mt-0" style={{ animationDelay: '300ms' }}>
          <h2 className="max-w-lg font-display text-[clamp(1.9rem,min(4vw,6.2vh),3.5rem)] leading-[1.05]">
            Saiba que <span className="text-accent">chegaram bem.</span>
          </h2>
          <p className="mt-3 max-w-md text-base text-white/90 lg:text-lg">Um toque no cartão e a família é avisada.</p>
          <ul className={`mt-5 hidden flex-col gap-2 lg:flex ${TALL}`}>
            {POINTS.map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] text-white/90">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />{t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Formulário direto no branco, sem caixa. No telemóvel sobe como uma folha sobre o topo azul. */}
      <section className="relative -mt-6 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-t-[26px] bg-surface px-6 lg:mt-0 lg:rounded-none lg:px-10">
        <form onSubmit={onSubmit} className="anim-rise flex w-full max-w-sm flex-col gap-5">
          <div>
            <h1 className="font-display text-[clamp(1.75rem,4.5vh,2.25rem)] text-ink">Entrar</h1>
            <p className="mt-1.5 text-muted">Use a conta que a escola lhe enviou.</p>
          </div>

          <div key={shake} className={`flex flex-col gap-4 ${shake ? 'anim-shake' : ''}`}>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Utilizador
              <input name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus className="input" placeholder="ex.: joana.silva" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Senha
              <span className="relative block">
                <input name="password" type={show ? 'text' : 'password'} required autoComplete="current-password" className="input pr-24" />
                <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} className="btn btn-quiet absolute right-1.5 top-1/2 -translate-y-1/2 text-sm">
                  {show ? 'Ocultar' : 'Mostrar'}
                </button>
              </span>
            </label>
          </div>

          {error && <p role="alert" className="anim-fade rounded-xl bg-bad-bg px-4 py-2.5 text-sm text-bad">{error}</p>}

          <button disabled={busy} className="btn btn-primary h-[50px] w-full text-base">
            {busy ? <><Spinner /> A entrar</> : <>Entrar <span aria-hidden>→</span></>}
          </button>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Acesso rápido (demonstração)</p>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.username} type="button" disabled={busy} onClick={() => signIn(a.username, DEMO_PASSWORD)} className="btn btn-quiet h-8 px-3 text-sm">
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
