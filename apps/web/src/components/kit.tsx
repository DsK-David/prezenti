'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="anim-rise mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-title1 text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Toast único por ecrã; a mesma palavra que o botão usou ("Guardar" → "Guardado"). */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);
  const show = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => setMsg({ text, tone, id: Date.now() }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg && (
    <div
      key={msg.id}
      role={msg.tone === 'bad' ? 'alert' : 'status'}
      className={`fixed bottom-6 left-1/2 z-40 max-w-[92vw] rounded-full border px-5 py-2.5 text-sm font-medium shadow-[0_12px_32px_-12px_rgb(22_32_58/0.25)] ${msg.tone === 'ok' ? 'border-line bg-surface text-ink' : 'border-bad/30 bg-bad-bg text-bad'}`}
      style={{ animation: 'toast 3.2s var(--ease) both' }}
    >
      {msg.text}
    </div>
  );
  return { show, node };
}

export function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="anim-fade fixed inset-0 z-30 flex items-end justify-center bg-[rgb(22_32_58/0.22)] p-4 backdrop-blur-sm sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="card anim-pop flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-auto p-6">
        <div>
          <h2 className="font-display text-title2">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <p className="font-display text-title3">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <ul>
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex items-center gap-4 border-b border-line p-4 last:border-0">
          <div className="skeleton h-9 w-9 rounded-full" /><div className="skeleton h-4 w-44" /><div className="skeleton ml-auto h-4 w-20" />
        </li>
      ))}
    </ul>
  );
}

/** Valor mostrado uma só vez (senha temporária, token do kiosk) com botão de copiar. */
export function Secret({ label, value, note }: { label: string; value: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); clearTimeout(t.current); t.current = setTimeout(() => setCopied(false), 1800); } catch {}
  };
  return (
    <div className="rounded-xl border border-brand/25 bg-brand-soft p-4">
      <p className="text-[13px] font-medium text-ink">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 font-mono text-sm">{value}</code>
        <button type="button" onClick={copy} className="btn btn-primary shrink-0">{copied ? 'Copiado' : 'Copiar'}</button>
      </div>
      <p className="mt-2 text-footnote text-muted">{note}</p>
    </div>
  );
}

/** Páginas 1 … 4 5 6 … 12: sempre a primeira, a última e as vizinhas da atual. */
export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums: Array<number | 'gap'> = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== 'gap') nums.push('gap');
  }
  const arrow = (dir: -1 | 1) => (
    <button
      onClick={() => onPage(page + dir)}
      disabled={dir === -1 ? page === 1 : page === pages}
      aria-label={dir === -1 ? 'Página anterior' : 'Página seguinte'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={dir === -1 ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} /></svg>
    </button>
  );
  return (
    <nav aria-label="Paginação" className="flex items-center gap-0.5">
      {arrow(-1)}
      {nums.map((n, i) => n === 'gap'
        ? <span key={`g${i}`} className="w-6 text-center text-muted" aria-hidden>…</span>
        : (
          <button
            key={n}
            onClick={() => onPage(n)}
            aria-current={n === page ? 'page' : undefined}
            className={`h-9 min-w-9 rounded-lg px-2 text-sm font-medium tabular-nums ${n === page ? 'bg-ink text-white' : 'text-ink hover:bg-surface-2'}`}
          >
            {n}
          </button>
        ))}
      {arrow(1)}
    </nav>
  );
}

/** Utilizador e senha temporária de uma conta nova, para entregar a quem a vai usar. */
export function Credentials({ username, password, note }: { username: string; password: string; note: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Secret label="Nome de utilizador" value={username} note="É com este nome que a pessoa entra no Prezenti." />
      <Secret label="Senha temporária" value={password} note={note} />
    </div>
  );
}

export const ERRORS: Record<string, string> = {
  username_in_use: 'Esse nome de utilizador já existe. Escolha outro.',
  guardian_name_required: 'Escreva o nome do encarregado.',
  slug_in_use: 'Já existe uma escola com esse identificador.',
  email_in_use: 'Já existe uma conta com esse email.',
  class_exists: 'Já existe uma turma com esse nome.',
  invalid_teacher: 'Escolha um professor desta escola.',
  invalid_students: 'Alguns alunos não pertencem a esta escola.',
  invalid_class: 'Escolha uma turma desta escola.',
  card_in_use: 'Esse cartão já está associado a outro aluno.',
  wrong_password: 'A senha atual está incorreta.',
  validation: 'Confira os campos do formulário. O nome de utilizador só aceita letras minúsculas, números, ponto e hífen.',
};
export const errText = (e: unknown, fallback = 'Não foi possível concluir. Tente de novo.') => ERRORS[(e as Error).message] ?? fallback;
