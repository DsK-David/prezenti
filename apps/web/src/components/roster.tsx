'use client';

import { useState } from 'react';
import { Avatar } from './ui';
import { ChoiceGroup, Field, FormDialog, FormSection } from './form';
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
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    try {
      await call('/incidents', { method: 'POST', body: JSON.stringify({ student_id: student.id, category: f.get('category'), note: f.get('note') }) });
      onDone();
    } catch { setError('Não foi possível registar a ocorrência. Tente de novo.'); setBusy(false); }
  }

  return (
    <FormDialog
      title="Registar ocorrência" subtitle={student.name} media={<Avatar name={student.name} size={36} />}
      onClose={onClose} onSubmit={submit} busy={busy} error={error}
      submitLabel="Registar ocorrência" busyLabel="A registar"
      footnote="A família recebe um aviso genérico e vê o detalhe na app."
    >
      <FormSection>
        <ChoiceGroup
          name="category" label="Tipo" defaultValue="health"
          options={[
            { value: 'health', label: 'Saúde', tone: 'var(--bad)' },
            { value: 'behavior', label: 'Comportamento', tone: 'var(--late)' },
            { value: 'other', label: 'Outro', tone: 'var(--gone)' },
          ]}
        />
        <Field label="O que aconteceu"><textarea name="note" required autoFocus maxLength={400} rows={4} className="input resize-none" placeholder="Ex.: dor de cabeça, está na secretaria." /></Field>
      </FormSection>
    </FormDialog>
  );
}
