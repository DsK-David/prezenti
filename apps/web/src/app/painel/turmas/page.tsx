'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/auth';
import { Avatar } from '@/components/ui';
import { Credentials, Empty, errText, PageHeader, SkeletonRows, useToast } from '@/components/kit';
import { ConfirmDialog, DoneDialog, Field, FormDialog, FormSection, UsernameField } from '@/components/form';

interface ClassRow { id: number; name: string; teacher_id: number | null; teacher_name: string | null; students: number }
interface Teacher { id: number; name: string; username: string; email: string | null; active: number }

type Dialog =
  | { kind: 'class'; row?: ClassRow }
  | { kind: 'teacher' }
  | { kind: 'delete'; row: ClassRow };

export default function Turmas() {
  const { session, ready, call } = useSession();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ title: string; who: string; username: string; password: string } | null>(null);
  const { show, node } = useToast();

  const load = useCallback(async () => {
    const [c, t] = await Promise.all([call<ClassRow[]>('/classes'), call<Teacher[]>('/teachers')]);
    setClasses(c); setTeachers(t);
  }, [call]);

  useEffect(() => { if (ready && session) void load().catch(() => show('Não foi possível carregar os dados.', 'bad')); }, [ready, session, load, show]);

  const open = (d: Dialog) => { setFormError(null); setDialog(d); };
  const close = () => setDialog(null);

  // Cada envio: espera, fecha a janela e avisa; um erro fica dentro da janela.
  async function run(action: () => Promise<void>) {
    setBusy(true); setFormError(null);
    try { await action(); setDialog(null); await load(); }
    catch (err) { setFormError(errText(err)); }
    setBusy(false);
  }

  const saveClass = (e: React.FormEvent<HTMLFormElement>) => {
    const f = new FormData(e.currentTarget);
    const body = JSON.stringify({ name: String(f.get('name')).trim(), teacher_id: f.get('teacher_id') ? Number(f.get('teacher_id')) : null });
    const row = dialog?.kind === 'class' ? dialog.row : undefined;
    return run(async () => {
      if (row) await call(`/classes/${row.id}`, { method: 'PATCH', body });
      else await call('/classes', { method: 'POST', body });
      show(row ? 'Turma guardada' : 'Turma criada');
    });
  };

  const addTeacher = (e: React.FormEvent<HTMLFormElement>) => {
    const f = new FormData(e.currentTarget);
    return run(async () => {
      const r = await call<{ username: string; temporary_password: string }>('/teachers', { method: 'POST', body: JSON.stringify({ name: f.get('name'), username: f.get('username') || undefined, email: f.get('email') || undefined }) });
      setSecret({ title: 'Professor criado', who: String(f.get('name')), username: r.username, password: r.temporary_password });
    });
  };

  const removeClass = (c: ClassRow) => run(async () => {
    await call(`/classes/${c.id}`, { method: 'DELETE' });
    show('Turma apagada');
  });

  async function reset(t: Teacher) {
    try {
      const r = await call<{ temporary_password: string }>(`/users/${t.id}/reset-password`, { method: 'POST' });
      setSecret({ title: 'Nova senha temporária', who: t.name, username: t.username, password: r.temporary_password });
    } catch (err) { show(errText(err), 'bad'); }
  }

  async function toggle(t: Teacher) {
    try { await call(`/users/${t.id}`, { method: 'PATCH', body: JSON.stringify({ active: !t.active }) }); await load(); show(t.active ? 'Professor desativado' : 'Professor ativado'); }
    catch (err) { show(errText(err), 'bad'); }
  }

  const activeTeachers = teachers?.filter((t) => t.active) ?? [];
  const editing = dialog?.kind === 'class' ? dialog.row : undefined;

  const panel = (title: string, subtitle: string, action: React.ReactNode, body: React.ReactNode) => (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:px-5">
        <div><h2 className="font-display text-title2">{title}</h2><p className="text-footnote text-muted">{subtitle}</p></div>
        {action}
      </div>
      {body}
    </section>
  );

  return (
    <section>
      <PageHeader title="Turmas e professores" subtitle="Cada professor vê e regista ocorrências só nas suas turmas." />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        {panel(
          'Turmas',
          classes ? `${classes.length} ${classes.length === 1 ? 'turma' : 'turmas'}` : 'A carregar',
          <button onClick={() => open({ kind: 'class' })} className="btn btn-primary">Nova turma</button>,
          classes === null ? <SkeletonRows n={3} /> : classes.length === 0 ? <Empty title="Ainda não há turmas" hint="Crie a primeira turma e escolha o professor." /> : (
            <ul className="divide-y divide-line">{classes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft font-display text-[13px] font-semibold text-brand">{c.name.slice(0, 3)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-footnote text-muted">{c.students} {c.students === 1 ? 'aluno' : 'alunos'} · {c.teacher_name ?? 'sem professor'}</p>
                </div>
                <button onClick={() => open({ kind: 'class', row: c })} className="btn btn-quiet text-sm">Editar</button>
                <button onClick={() => open({ kind: 'delete', row: c })} className="btn btn-quiet text-sm text-bad hover:bg-bad-bg">Apagar</button>
              </li>))}</ul>
          ),
        )}

        {panel(
          'Professores',
          teachers ? `${activeTeachers.length} ${activeTeachers.length === 1 ? 'ativo' : 'ativos'}` : 'A carregar',
          <button onClick={() => open({ kind: 'teacher' })} className="btn btn-primary">Novo professor</button>,
          teachers === null ? <SkeletonRows n={3} /> : teachers.length === 0 ? <Empty title="Ainda não há professores" hint="Crie a conta e entregue a senha temporária ao professor." /> : (
            <ul className="divide-y divide-line">{teachers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={t.name} />
                <div className="min-w-0 flex-1"><p className={`truncate font-medium ${t.active ? '' : 'text-muted'}`}>{t.name}</p><p className="truncate text-footnote text-muted"><span className="font-mono">{t.username}</span>{t.email ? ` · ${t.email}` : ''}</p></div>
                {!t.active && <span className="pill" style={{ ['--tone' as string]: 'var(--gone)' }}>Inativo</span>}
                <button onClick={() => reset(t)} className="btn btn-quiet text-sm">Nova senha</button>
                <button onClick={() => toggle(t)} className="btn btn-quiet text-sm">{t.active ? 'Desativar' : 'Ativar'}</button>
              </li>))}</ul>
          ),
        )}
      </div>

      {dialog?.kind === 'class' && (
        <FormDialog
          title={editing ? 'Editar turma' : 'Nova turma'} subtitle={editing ? editing.name : 'O professor escolhido passa a ver esta turma.'}
          onClose={close} onSubmit={saveClass} busy={busy} error={formError}
          submitLabel={editing ? 'Guardar alterações' : 'Criar turma'} busyLabel={editing ? 'A guardar' : 'A criar'}
        >
          <FormSection>
            <Field label="Nome da turma" hint="Como aparece nas listas e nos relatórios."><input name="name" required autoFocus maxLength={60} defaultValue={editing?.name} placeholder="Ex.: 3.º B" autoComplete="off" className="input" /></Field>
            <Field label="Professor" optional>
              <select name="teacher_id" defaultValue={editing?.teacher_id ?? ''} className="input">
                <option value="">Sem professor</option>{activeTeachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </FormSection>
        </FormDialog>
      )}
      {dialog?.kind === 'teacher' && (
        <FormDialog
          title="Novo professor" subtitle="A conta é criada com uma senha temporária, mostrada no fim."
          onClose={close} onSubmit={addTeacher} busy={busy} error={formError}
          submitLabel="Criar professor" busyLabel="A criar"
        >
          <FormSection>
            <Field label="Nome completo"><input name="name" required autoFocus maxLength={120} autoComplete="off" className="input" /></Field>
            <UsernameField />
            <Field label="Email" optional hint="Só para contacto."><input name="email" type="email" autoComplete="off" className="input" /></Field>
          </FormSection>
        </FormDialog>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Apagar a turma ${dialog.row.name}?`} confirmLabel="Apagar turma" busyLabel="A apagar" busy={busy}
          onConfirm={() => removeClass(dialog.row)} onClose={close}
        >
          {dialog.row.students > 0
            ? <>Os {dialog.row.students} alunos desta turma ficam sem turma. As presenças já registadas mantêm-se.</>
            : <>A turma não tem alunos. Esta ação não pode ser desfeita.</>}
          {formError && <p className="mt-3 text-footnote text-bad">{formError}</p>}
        </ConfirmDialog>
      )}
      {secret && (
        <DoneDialog title={secret.title} subtitle={secret.who} onClose={() => setSecret(null)}>
          <Credentials username={secret.username} password={secret.password} note="Mostrada só agora. Entregue-a pessoalmente e peça para trocar em Definições." />
        </DoneDialog>
      )}
      {node}
    </section>
  );
}
