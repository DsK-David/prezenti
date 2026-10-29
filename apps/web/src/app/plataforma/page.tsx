'use client';

import { useCallback, useEffect, useState } from 'react';
import { homeFor, logout, useSession } from '@/lib/auth';
import { Wordmark } from '@/components/ui';
import { Credentials, Empty, PageHeader, SkeletonRows, useToast, errText } from '@/components/kit';
import { DoneDialog, Field, FormDialog, FormSection, UsernameField } from '@/components/form';

interface School { id: number; name: string; slug: string; active: number; students: number; devices: number }

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Plataforma() {
  const { session, ready, call } = useSession();
  const [schools, setSchools] = useState<School[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ school: string; username: string; password: string } | null>(null);
  const { show, node } = useToast();

  useEffect(() => {
    if (!ready) return;
    if (!session) window.location.replace('/');
    else if (session.user.role !== 'super_admin') window.location.replace(homeFor(session.user.role));
  }, [ready, session]);

  const load = useCallback(async () => setSchools(await call<School[]>('/schools')), [call]);
  useEffect(() => { if (ready && session?.user.role === 'super_admin') void load().catch(() => show('Não foi possível carregar as escolas.', 'bad')); }, [ready, session, load, show]);

  if (!session || session.user.role !== 'super_admin') return null;

  async function create(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget); setBusy(true); setFormError(null);
    try {
      const r = await call<{ admin_username: string; admin_temporary_password: string }>('/schools', { method: 'POST', body: JSON.stringify({ name: f.get('name'), slug: f.get('slug'), admin_name: f.get('admin_name'), admin_username: f.get('admin_username') || undefined, admin_email: f.get('admin_email') || undefined }) });
      setAdding(false); setSecret({ school: String(f.get('name')), username: r.admin_username, password: r.admin_temporary_password });
      setName(''); await load();
    } catch (err) { setFormError((err as Error).message === 'validation' ? 'Confira o nome, o identificador e o nome de utilizador.' : errText(err, 'Não foi possível criar a escola. O identificador ou o nome de utilizador já existem?')); }
    setBusy(false);
  }

  async function toggle(s: School) {
    try { await call(`/schools/${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: !s.active }) }); await load(); show(s.active ? 'Escola suspensa' : 'Escola reativada'); }
    catch (err) { show(errText(err), 'bad'); }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[var(--content-max)] items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-3"><Wordmark /><span className="pill" style={{ ['--tone' as string]: 'var(--brand)' }}>Plataforma</span></div>
          <button onClick={logout} className="btn btn-ghost px-3 py-1.5 text-sm">Sair</button>
        </div>
      </header>
      <main className="mx-auto max-w-[var(--content-max)] px-4 py-10 sm:px-8">
        <PageHeader
          title="Escolas"
          subtitle={schools ? `${schools.length} escolas · ${schools.reduce((n, s) => n + s.students, 0)} alunos` : 'A carregar'}
          action={<button onClick={() => { setFormError(null); setName(''); setAdding(true); }} className="btn btn-primary">Nova escola</button>}
        />


        <div className="card overflow-hidden">
          {schools === null ? <SkeletonRows n={3} /> : schools.length === 0 ? <Empty title="Ainda não há escolas" hint="Crie a primeira escola e entregue a senha temporária ao gestor." /> : (
            <ul>{schools.map((s, i) => (
              <li key={s.id} className="anim-rise flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-5 py-4 last:border-0" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <div className="min-w-0 flex-1 basis-48"><p className={`font-display text-title3 ${s.active ? '' : 'text-muted line-through'}`}>{s.name}</p><p className="font-mono text-xs text-muted">{s.slug}</p></div>
                <dl className="flex gap-6 text-sm">
                  <div><dt className="text-xs text-muted">Alunos</dt><dd className="font-semibold tabular-nums">{s.students}</dd></div>
                  <div><dt className="text-xs text-muted">Dispositivos</dt><dd className="font-semibold tabular-nums">{s.devices}</dd></div>
                </dl>
                <span className="pill" style={{ ['--tone' as string]: s.active ? 'var(--ok)' : 'var(--bad)' }}>{s.active ? 'Ativa' : 'Suspensa'}</span>
                <button onClick={() => toggle(s)} className="btn btn-quiet px-2 text-sm">{s.active ? 'Suspender' : 'Reativar'}</button>
              </li>))}</ul>
          )}
        </div>
      </main>

      {adding && (
        <FormDialog
          title="Nova escola" subtitle="Cria a escola e a conta do gestor, com uma senha temporária mostrada no fim."
          onClose={() => setAdding(false)} onSubmit={create} busy={busy} error={formError}
          submitLabel="Criar escola" busyLabel="A criar"
        >
          <FormSection title="Escola">
            <Field label="Nome da escola"><input name="name" required autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className="input" /></Field>
            <Field label="Identificador" hint="Gerado a partir do nome; usado nos endereços."><input name="slug" required pattern="[a-z0-9\-]+" value={slugify(name)} readOnly tabIndex={-1} className="input bg-surface-2 font-mono text-muted" /></Field>
          </FormSection>
          <FormSection title="Gestor" description="Quem vai configurar a escola: turmas, alunos e dispositivos.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo"><input name="admin_name" required maxLength={120} autoComplete="off" className="input" /></Field>
              <Field label="Email" optional hint="Só para contacto."><input name="admin_email" type="email" autoComplete="off" className="input" /></Field>
            </div>
            <div>
              <UsernameField name="admin_username" />
            </div>
          </FormSection>
        </FormDialog>
      )}
      {secret && (
        <DoneDialog title="Escola criada" subtitle={secret.school} onClose={() => setSecret(null)}>
          <Credentials username={secret.username} password={secret.password} note="Mostrada só agora. O gestor deve trocá-la no primeiro acesso, em Definições." />
        </DoneDialog>
      )}
      {node}
    </div>
  );
}
