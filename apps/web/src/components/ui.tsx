import type { CSSProperties } from 'react';

/** Marca: ponto + ondas NFC. É o motivo que liga login, painel e kiosk. */
export function RingMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="9" cy="16" r="3.2" fill="currentColor" />
      <path d="M15 9.5a9.5 9.5 0 0 1 0 13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20.5 5.5a15.5 15.5 0 0 1 0 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-display text-xl text-ink">
      <span className="text-brand"><RingMark /></span>
      Prezenti
    </span>
  );
}

/** Ondas ambientais lentas, usadas como atmosfera atrás do conteúdo. */
export function Rings({ size = 220, count = 3 }: { size?: number; count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none relative" style={{ width: size, height: size }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="nfc-ring" style={{ width: size / 2.4, height: size / 2.4, animationDelay: `${i * 1.4}s` }} />
      ))}
    </div>
  );
}

// Só matizes da família azul/ciano/violeta, para manter a coerência.
const HUES = [222, 200, 250, 188, 236];
const hue = (s: string) => HUES[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7) % HUES.length];

export function Avatar({ name, size = 36, src }: { name: string; size?: number; src?: string | null }) {
  const h = hue(name);
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const style: CSSProperties = {
    width: size, height: size, fontSize: size * 0.38,
    background: `hsl(${h} 55% 45% / 0.14)`, color: `hsl(${h} 65% 34%)`,
  };
  return <span className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold" style={style} aria-hidden>{initials}</span>;
}

/** "Ao vivo": o ponto emite a mesma onda do NFC. */
export function LivePulse({ off = false, label }: { off?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted" role="status">
      <span className="relative flex h-2.5 w-2.5">
        {!off && <span className="absolute inset-0 rounded-full bg-ok" style={{ animation: 'ring 2.4s var(--ease) infinite' }} aria-hidden />}
        <span className={`relative h-2.5 w-2.5 rounded-full ${off ? 'bg-bad' : 'bg-ok'}`} />
      </span>
      {label}
    </span>
  );
}

/** Cápsula suave com um ícone de traço, usada nos cartões do painel. */
export function IconChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
    </span>
  );
}

export function Spinner() {
  return <span className="anim-spin inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}

/** Cena animada: cartão do aluno toca no leitor, ondas saem e o aviso à família aparece. */
export function NfcScene({ className = '' }: { className?: string }) {
  return (
    <div className={`relative h-[320px] w-[340px] ${className}`} role="img" aria-label="Um cartão de aluno encosta no leitor e a família recebe o aviso de chegada.">
      <div className="nfc-note absolute left-1/2 top-0 w-[290px] -translate-x-1/2 rounded-2xl bg-white p-4 text-ink shadow-[0_24px_50px_-20px_rgb(10_30_110/0.55)]">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
          <span className="text-brand"><RingMark size={15} /></span> Prezenti · agora
        </div>
        <p className="mt-2 font-display text-lg leading-snug">Joana chegou à escola às 07:42.</p>
        <p className="mt-0.5 text-sm text-muted">Portaria principal</p>
      </div>

      {/* Leitor visto de cima */}
      <div className="absolute bottom-3 left-1/2 h-[150px] w-[250px] -translate-x-1/2 text-white/80">
        <div className="nfc-pad relative flex h-full w-full items-center justify-center rounded-[28px] border-2 border-white/35 bg-white/12 backdrop-blur-[2px]">
          <span className="nfc-wave nfc-wave-1" aria-hidden />
          <span className="nfc-wave nfc-wave-2" aria-hidden />
          <span className="absolute bottom-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">Portaria</span>
        </div>
      </div>

      {/* Cartão do aluno */}
      <div className="nfc-card absolute bottom-[30px] left-1/2 -ml-[100px] h-[126px] w-[200px] rounded-2xl bg-linear-to-br from-white to-[#e6edff] p-3.5 text-ink shadow-[0_18px_40px_-14px_rgb(10_30_110/0.6)]">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted">Cartão de aluno</span>
          <span className="text-brand"><RingMark size={18} /></span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Avatar name="Joana Silva" size={44} />
          <div className="leading-tight">
            <p className="font-display text-[15px]">Joana Silva</p>
            <p className="text-xs text-muted">1.º A</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          <span className="h-4 w-6 rounded-[4px] bg-linear-to-br from-[#dfe6f7] to-[#b9c6e6]" />
          <span className="h-1.5 w-16 rounded-full bg-[#dfe6f7]" />
        </div>
      </div>
    </div>
  );
}
