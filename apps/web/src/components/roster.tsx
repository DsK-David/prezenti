'use client';

import { useEffect, useState } from 'react';
import { Avatar, Spinner } from './ui';
import type { useSession } from '@/lib/auth';

/** Entrada, almoço e saída em três passos. O que já aconteceu fica preenchido. */
export function Steps({ entry, lunch, exit }: { entry: string | null; lunch: boolean | string | null; exit: string | null }) {
  const steps = [
    { label: 'Entrada', done: !!entry, value: entry },
    { label: 'Almoço', done: !!lunch, value: typeof lunch === 'string' ? lunch : lunch ? 'sim' : null },
    { label: 'Saída', done: !!exit, value: exit },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5" aria-label={`${s.label}: ${s.value ?? 'ainda não'}`}>
          <span className={`h-2 w-2 rounded-full ${s.done ? 'bg-brand' : 'border border-line'}`} aria-hidden />
          <span className="text-muted">{s.label}</span>
          <span className={`font-mono tabular-nums ${s.done ? 'text-ink' : 'text-muted/60'}`}>{s.value ?? '–'}</span>
        </li>
      ))}
    </ol>
  );
}

export type HistoryStatus = 'present' | 'late' | 'absent' | 'pending';

const DOT: Record<HistoryStatus, { label: string; cls: string }> = {
  present: { label: 'presente', cls: 'bg-brand' },
  late: { label: 'atrasado', cls: 'bg-late' },
  absent: { label: 'faltou', cls: 'border-2 border-bad/60 bg-transparent' },
  pending: { label: 'ainda sem registo', cls: 'border border-dashed border-line bg-transparent' },
};

/** Presença dos últimos dias letivos: um ponto por dia (cheio = veio, âmbar = atraso, aro = faltou). */
export function PresenceDots({ history }: { history: { date: string; status: HistoryStatus }[] }) {
  const counted = history.filter((h) => h.status !== 'pending');
  const came = counted.filter((h) => h.status !== 'absent').length;
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`Veio em ${came} de ${counted.length} dias letivos`}>
      <ul className="flex items-center gap-1">
        {history.map((h) => (
          <li key={h.date} title={`${h.date.slice(8, 10)}/${h.date.slice(5, 7)}: ${DOT[h.status].label}`} className={`h-2.5 w-2.5 rounded-full ${DOT[h.status].cls}`} />
        ))}
      </ul>
      <span className="text-xs tabular-nums text-muted">{came}/{counted.length}</span>
    </div>
  );
}

export function IncidentDialog({ student, call, onClose, onDone }: {
  student: { id: number; name: string }; call: ReturnType<typeof useSession>['call']; onClose: () => void; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(false);
    const f = new FormData(e.currentTarget);
    try {
      await call('/incidents', { method: 'POST', body: JSON.stringify({ student_id: student.id, category: f.get('category'), note: f.get('note') }) });
      onDone();
    } catch { setError(true); setBusy(false); }
  }

  return (
    <div className="anim-fade fixed inset-0 z-20 flex items-end justify-center bg-[rgb(22_32_58/0.22)] p-4 backdrop-blur-sm sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby="inc-title" onSubmit={submit} className="card anim-pop flex w-full max-w-md flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <Avatar name={student.name} size={40} />
          <div>
            <h2 id="inc-title" className="font-display text-xl leading-tight">Registar ocorrência</h2>
            <p className="text-sm text-muted">{student.name}</p>
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Tipo
          <select name="category" className="input" autoFocus>
            <option value="health">Saúde</option><option value="behavior">Comportamento</option><option value="other">Outro</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          O que aconteceu
          <textarea name="note" required maxLength={400} rows={4} className="input resize-none" placeholder="Ex.: dor de cabeça, está na secretaria." />
        </label>
        <p className="text-xs text-muted">Os encarregados recebem um aviso genérico e veem o detalhe dentro do app.</p>
        {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">Não foi possível registar a ocorrência. Tente de novo.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
          <button disabled={busy} className="btn btn-primary">{busy ? <><Spinner /> A registar</> : 'Registar ocorrência'}</button>
        </div>
      </form>
    </div>
  );
}
