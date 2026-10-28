'use client';

import { useState } from 'react';
import { homeFor, login } from '@/lib/auth';
import { NfcScene, RingMark, Rings, Spinner } from '@/components/ui';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email ou senha incorretos. Confirme os dados e tente de novo.',
  validation: 'Preencha o email e a senha.',
};

const POINTS = ['Entrada, almoço e saída em segundos', 'Aviso direto no telemóvel da família', 'Continua a registar sem internet'];

// Altura baixa (portátil pequeno, telemóvel deitado): corta o que é só decoração, nunca o formulário.
const TALL = '[@media(max-height:760px)]:hidden';

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const { user } = await login(String(f.get('email')), String(f.get('password')));
      window.location.href = homeFor(user.role);
    } catch (err) {
      setError(MESSAGES[(err as Error).message] ?? 'Sem ligação ao servidor. Verifique a internet e tente de novo.');
      setShake((n) => n + 1);
      setBusy(false);
    }
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
              Email
              <input name="email" type="email" required autoComplete="username" autoFocus className="input" placeholder="nome@escola.cv" />
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

          <p className={`text-center text-xs text-muted ${TALL}`}>Problemas com o acesso? Fale com a secretaria da escola.</p>
        </form>
      </section>
    </main>
  );
}
