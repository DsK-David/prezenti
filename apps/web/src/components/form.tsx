'use client';

import { useEffect, useId, useState } from 'react';
import { Spinner } from './ui';

/**
 * Base única dos formulários do painel.
 * Janela: cabeçalho (título, frase, fechar) · corpo em secções · rodapé fixo com Cancelar e um só botão principal.
 * Página: as mesmas secções, com o título à esquerda e os campos à direita em ecrãs largos.
 */

const X = 'M6 6l12 12M18 6 6 18';

/** Fundo, painel, Esc para fechar e foco devolvido a quem abriu a janela. */
function DialogShell({ label, size = 'md', onClose, locked, children, as = 'div', onSubmit }: {
  label: string; size?: 'sm' | 'md' | 'lg'; onClose: () => void; locked?: boolean; children: React.ReactNode;
  as?: 'div' | 'form'; onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  // Lido no 1.º render, antes de o autoFocus mover o foco para dentro da janela.
  const [opener] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !locked) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      (opener as HTMLElement | null)?.focus?.();
    };
  }, [onClose, locked, opener]);

  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size];
  const panel = `card anim-pop flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-b-[var(--radius-lg)] ${width}`;
  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-[rgb(15_30_61/0.35)] backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}
    >
      {as === 'form'
        ? <form role="dialog" aria-modal="true" aria-label={label} onSubmit={onSubmit} className={panel} noValidate={false}>{children}</form>
        : <div role="dialog" aria-modal="true" aria-label={label} className={panel}>{children}</div>}
    </div>
  );
}

function DialogHeader({ title, subtitle, media, onClose, locked }: { title: string; subtitle?: string; media?: React.ReactNode; onClose: () => void; locked?: boolean }) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
      {media}
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-title2 text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-footnote text-muted">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} disabled={locked} aria-label="Fechar" className="-mr-1.5 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d={X} /></svg>
      </button>
    </div>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="anim-fade flex items-start gap-2 rounded-lg border border-bad/20 bg-bad-bg px-3 py-2.5 text-footnote text-bad">
      <svg className="mt-px shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5m0 3.5h.01" /></svg>
      <span>{children}</span>
    </p>
  );
}

export function SubmitButton({ busy, busyLabel, children, tone = 'primary', disabled }: { busy?: boolean; busyLabel: string; children: React.ReactNode; tone?: 'primary' | 'danger'; disabled?: boolean }) {
  return (
    <button type="submit" disabled={busy || disabled} className={`btn ${tone === 'danger' ? 'bg-bad text-white hover:bg-[#a92f25]' : 'btn-primary'}`}>
      {busy ? <><Spinner /> {busyLabel}</> : children}
    </button>
  );
}

/** Janela de formulário. `onSubmit` recebe o evento do form; o botão principal diz o que acontece ("Criar turma"). */
export function FormDialog({ title, subtitle, media, size, onClose, onSubmit, busy, error, submitLabel, busyLabel, tone, footnote, submitDisabled, children }: {
  title: string; subtitle?: string; media?: React.ReactNode; size?: 'sm' | 'md' | 'lg';
  onClose: () => void; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  busy?: boolean; error?: string | null; submitLabel: string; busyLabel: string; tone?: 'primary' | 'danger';
  footnote?: React.ReactNode; submitDisabled?: boolean; children: React.ReactNode;
}) {
  return (
    <DialogShell label={title} size={size} onClose={onClose} locked={busy} as="form" onSubmit={(e) => { e.preventDefault(); onSubmit(e); }}>
      <DialogHeader title={title} subtitle={subtitle} media={media} onClose={onClose} locked={busy} />
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5 sm:px-6">
        {children}
        {error && <FormError>{error}</FormError>}
      </div>
      <div className="flex flex-col gap-2.5 border-t border-line bg-surface-2/50 px-5 py-3 sm:flex-row sm:items-center sm:px-6">
        {footnote && <p className="text-footnote text-muted sm:mr-auto">{footnote}</p>}
        <div className="flex gap-2 sm:ml-auto">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost shrink-0 bg-surface">Cancelar</button>
          <div className="flex min-w-0 flex-1 sm:flex-none [&>button]:w-full [&>button]:whitespace-nowrap"><SubmitButton busy={busy} busyLabel={busyLabel} tone={tone} disabled={submitDisabled}>{submitLabel}</SubmitButton></div>
        </div>
      </div>
    </DialogShell>
  );
}

/** Depois de criar: confirmação com o que é preciso guardar (senha, token) e um só botão. */
export function DoneDialog({ title, subtitle, onClose, children, doneLabel = 'Feito' }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; doneLabel?: string }) {
  return (
    <DialogShell label={title} onClose={onClose}>
      <DialogHeader
        title={title} subtitle={subtitle} onClose={onClose}
        media={<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok-bg text-ok"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>}
      />
      <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      <div className="flex border-t border-line bg-surface-2/50 px-5 py-3 sm:justify-end sm:px-6">
        <button type="button" autoFocus onClick={onClose} className="btn btn-primary w-full sm:w-auto">{doneLabel}</button>
      </div>
    </DialogShell>
  );
}

/** Substitui o confirm() do navegador: diz o que acontece e o botão repete a ação ("Apagar turma"). */
export function ConfirmDialog({ title, children, confirmLabel, busyLabel, busy, onConfirm, onClose }: {
  title: string; children: React.ReactNode; confirmLabel: string; busyLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <FormDialog size="sm" title={title} onClose={onClose} onSubmit={onConfirm} busy={busy} submitLabel={confirmLabel} busyLabel={busyLabel} tone="danger">
      <div className="text-body text-muted">{children}</div>
    </FormDialog>
  );
}

/** Grupo de campos com título. `aside` põe o título à esquerda em ecrãs largos (formulários de página). */
export function FormSection({ title, description, children, columns = 1, aside = false }: {
  title?: string; description?: string; children: React.ReactNode; columns?: 1 | 2; aside?: boolean;
}) {
  const grid = columns === 2 ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4';
  return (
    <section className={aside ? 'grid gap-4 py-6 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-10' : 'flex flex-col gap-3'}>
      {(title || description) && (
        <div>
          {title && <h3 className="text-[13px] font-semibold text-ink">{title}</h3>}
          {description && <p className="mt-0.5 max-w-prose text-footnote text-muted">{description}</p>}
        </div>
      )}
      <div className={grid}>{children}</div>
    </section>
  );
}

/** Formulário dentro da página (ex.: Definições): secções separadas por linhas e ações no fundo. */
export function FormPanel({ onSubmit, children, busy, error, submitLabel, busyLabel, footnote }: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; children: React.ReactNode;
  busy?: boolean; error?: string | null; submitLabel: string; busyLabel: string; footnote?: React.ReactNode;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(e); }} className="card overflow-hidden">
      <div className="divide-y divide-line px-5 py-6 sm:px-6">{children}</div>
      {error && <div className="px-5 pb-4 sm:px-6"><FormError>{error}</FormError></div>}
      <div className="flex flex-col gap-2.5 border-t border-line bg-surface-2/50 px-5 py-3 sm:flex-row sm:items-center sm:px-6">
        {footnote && <p className="text-footnote text-muted sm:mr-auto">{footnote}</p>}
        <div className="sm:ml-auto"><SubmitButton busy={busy} busyLabel={busyLabel}>{submitLabel}</SubmitButton></div>
      </div>
    </form>
  );
}

/** Etiqueta, campo, ajuda e erro. Campos opcionais dizem-no; os obrigatórios não levam asterisco. */
export function Field({ label, children, hint, error, optional, className = '' }: {
  label: string; children: React.ReactNode; hint?: React.ReactNode; error?: string | null; optional?: boolean; className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-ink">
        {label}{optional && <span className="font-normal text-muted"> (opcional)</span>}
      </span>
      {children}
      {error ? <span className="text-footnote text-bad">{error}</span> : hint && <span className="text-footnote text-muted">{hint}</span>}
    </label>
  );
}

/** Interruptor para estados ligado/desligado (ex.: aluno ativo). */
export function Switch({ name, defaultChecked, label, description }: { name: string; defaultChecked?: boolean; label: string; description?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line p-3.5 hover:bg-surface-2/50">
      <span>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-footnote text-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} name={name} type="checkbox" role="switch" defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="h-5 w-9 rounded-full bg-[#c9d1e2] transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

/** Escolha única em cartões (substitui um select curto, ex.: tipo de ocorrência). */
export function ChoiceGroup({ name, label, options, defaultValue }: {
  name: string; label: string; options: Array<{ value: string; label: string; hint?: string; tone?: string }>; defaultValue: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-ink">{label}</legend>
      <div className={`grid gap-2 ${options.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((o) => (
          <label key={o.value} className="relative flex cursor-pointer flex-col gap-0.5 rounded-xl border border-line p-3 text-[13px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
            <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="sr-only" />
            <span className="flex items-center gap-1.5 font-medium text-ink">
              {o.tone && <span className="h-2 w-2 rounded-full" style={{ background: o.tone }} aria-hidden />}{o.label}
            </span>
            {o.hint && <span className="text-caption text-muted">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Nome de utilizador para entrar. Vazio: a API gera-o a partir do nome (ex.: joana.silva) e mostra-o no fim. */
export function UsernameField({ name = 'username', optional = true, defaultValue }: { name?: string; optional?: boolean; defaultValue?: string }) {
  return (
    <Field label="Nome de utilizador" optional={optional} hint={optional ? 'Vazio: é criado a partir do nome, ex.: joana.silva.' : 'Letras minúsculas, números, ponto ou hífen.'}>
      <input
        name={name} defaultValue={defaultValue} required={!optional}
        pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,31}" title="3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado."
        autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="ex.: joana.silva"
        className="input font-mono"
      />
    </Field>
  );
}
