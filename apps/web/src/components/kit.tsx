'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Spinner } from './ui';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="anim-rise mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">{title}</h1>
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
          <h2 className="font-display text-xl">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center">
      <p className="font-display text-lg">{title}</p>
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
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 font-mono text-sm">{value}</code>
        <button type="button" onClick={copy} className="btn btn-primary shrink-0 px-3 py-2 text-sm">{copied ? 'Copiado' : 'Copiar'}</button>
      </div>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </div>
  );
}

/** Botão de submissão com estado de espera; o único primário do formulário. */
export function Submit({ busy, children, busyText }: { busy: boolean; children: React.ReactNode; busyText: string }) {
  return <button disabled={busy} className="btn btn-primary">{busy ? <><Spinner /> {busyText}</> : children}</button>;
}

export const ERRORS: Record<string, string> = {
  email_in_use: 'Já existe uma conta com esse email.',
  class_exists: 'Já existe uma turma com esse nome.',
  invalid_teacher: 'Escolha um professor desta escola.',
  invalid_students: 'Alguns alunos não pertencem a esta escola.',
  invalid_class: 'Escolha uma turma desta escola.',
  card_in_use: 'Esse cartão já está associado a outro aluno.',
  wrong_password: 'A senha atual está incorreta.',
  validation: 'Confira os campos do formulário.',
};
export const errText = (e: unknown, fallback = 'Não foi possível concluir. Tente de novo.') => ERRORS[(e as Error).message] ?? fallback;
