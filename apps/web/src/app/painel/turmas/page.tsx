'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/auth';
import { Avatar } from '@/components/ui';
import { Empty, errText, Field, Modal, PageHeader, Secret, SkeletonRows, Submit, useToast } from '@/components/kit';

interface ClassRow { id: number; name: string; teacher_id: number | null; teacher_name: string | null; students: number }
interface Teacher { id: number; name: string; email: string; active: number }

export default function Turmas() {
  const { session, ready, call } = useSession();
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ title: string; who: string; password: string } | null>(null);
  const { show, node } = useToast();

  const load = useCallback(async () => {
    const [c, t] = await Promise.all([call<ClassRow[]>('/classes'), call<Teacher[]>('/teachers')]);
    setClasses(c); setTeachers(t);
  }, [call]);

  useEffect(() => { if (ready && session) void load().catch(() => show('Não foi possível carregar os dados.', 'bad')); }, [ready, session, load, show]);

  async function addClass(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setBusy('class');
    try {
      await call('/classes', { method: 'POST', body: JSON.stringify({ name: f.get('name'), teacher_id: f.get('teacher_id') ? Number(f.get('teacher_id')) : null }) });
      form.reset(); await load(); show('Turma criada');
    } catch (err) { show(errText(err), 'bad'); }
    setBusy(null);
  }

  async function setTeacher(c: ClassRow, teacher_id: number | null) {
    try { await call(`/classes/${c.id}`, { method: 'PATCH', body: JSON.stringify({ teacher_id }) }); await load(); show('Professor atualizado'); }
    catch (err) { show(errText(err), 'bad'); }
  }

  async function removeClass(c: ClassRow) {
    if (!confirm(`Apagar a turma ${c.name}? Os ${c.students} alunos ficam sem turma.`)) return;
    try { await call(`/classes/${c.id}`, { method: 'DELETE' }); await load(); show('Turma apagada'); } catch (err) { show(errText(err), 'bad'); }
  }

  async function addTeacher(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setBusy('teacher');
    try {
      const r = await call<{ temporary_password: string }>('/teachers', { method: 'POST', body: JSON.stringify({ name: f.get('name'), email: f.get('email') }) });
      setSecret({ title: 'Professor criado', who: String(f.get('name')), password: r.temporary_password });
      form.reset(); await load();
    } catch (err) { show(errText(err), 'bad'); }
    setBusy(null);
  }

  async function reset(t: Teacher) {
    try {
      const r = await call<{ temporary_password: string }>(`/users/${t.id}/reset-password`, { method: 'POST' });
      setSecret({ title: 'Nova senha temporária', who: t.name, password: r.temporary_password });
    } catch (err) { show(errText(err), 'bad'); }
  }

  async function toggle(t: Teacher) {
    try { await call(`/users/${t.id}`, { method: 'PATCH', body: JSON.stringify({ active: !t.active }) }); await load(); show(t.active ? 'Professor desativado' : 'Professor ativado'); }
    catch (err) { show(errText(err), 'bad'); }
  }

  const activeTeachers = teachers?.filter((t) => t.active) ?? [];

  return (
    <section>
      <PageHeader title="Turmas e professores" subtitle="Cada professor vê e regista ocorrências só na sua turma." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-xl">Turmas</h2>
          <form onSubmit={addClass} className="card anim-rise grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Nome da turma"><input name="name" required maxLength={60} placeholder="Ex.: 3.º B" className="input" /></Field>
            <Field label="Professor"><select name="teacher_id" className="input"><option value="">Sem professor</option>{activeTeachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Submit busy={busy === 'class'} busyText="A criar">Criar turma</Submit>
          </form>
          <div className="card overflow-hidden">
            {classes === null ? <SkeletonRows n={3} /> : classes.length === 0 ? <Empty title="Ainda não há turmas" hint="Crie a primeira turma no formulário acima." /> : (
              <ul>{classes.map((c, i) => (
                <li key={c.id} className="anim-rise flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <div className="min-w-0 flex-1"><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{c.students} alunos</p></div>
                  <select aria-label={`Professor da turma ${c.name}`} value={c.teacher_id ?? ''} onChange={(e) => setTeacher(c, e.target.value ? Number(e.target.value) : null)} className="input w-auto min-w-40 py-1.5">
                    <option value="">Sem professor</option>{activeTeachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button onClick={() => removeClass(c)} className="btn btn-quiet px-2 text-bad">Apagar</button>
                </li>))}</ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="font-display text-xl">Professores</h2>
          <form onSubmit={addTeacher} className="card anim-rise grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" style={{ animationDelay: '60ms' }}>
            <Field label="Nome"><input name="name" required className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Submit busy={busy === 'teacher'} busyText="A criar">Criar professor</Submit>
          </form>
          <div className="card overflow-hidden">
            {teachers === null ? <SkeletonRows n={3} /> : teachers.length === 0 ? <Empty title="Ainda não há professores" hint="Crie a conta e entregue a senha temporária ao professor." /> : (
              <ul>{teachers.map((t, i) => (
                <li key={t.id} className="anim-rise flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <Avatar name={t.name} />
                  <div className="min-w-0 flex-1"><p className={`truncate font-medium ${t.active ? '' : 'text-muted line-through'}`}>{t.name}</p><p className="truncate text-xs text-muted">{t.email}</p></div>
                  <button onClick={() => reset(t)} className="btn btn-quiet px-2 text-sm">Nova senha</button>
                  <button onClick={() => toggle(t)} className="btn btn-quiet px-2 text-sm">{t.active ? 'Desativar' : 'Ativar'}</button>
                </li>))}</ul>
            )}
          </div>
        </div>
      </div>

      {secret && (
        <Modal title={secret.title} subtitle={secret.who} onClose={() => setSecret(null)}>
          <Secret label="Senha temporária" value={secret.password} note="Mostrada só agora. Entregue-a pessoalmente e peça para trocar em Definições." />
          <button onClick={() => setSecret(null)} className="btn btn-primary">Feito</button>
        </Modal>
      )}
      {node}
    </section>
  );
}
