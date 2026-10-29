'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth';
import { errText, PageHeader, useToast } from '@/components/kit';
import { Field, FormPanel, FormSection } from '@/components/form';

interface School { name: string; timezone: string; min_exit_time: string; late_after: string }

export default function Definicoes() {
  const { session, ready, call } = useSession();
  const [school, setSchool] = useState<School | null>(null);
  const [busy, setBusy] = useState<'school' | 'pass' | null>(null);
  const [errors, setErrors] = useState<{ school?: string; pass?: string }>({});
  const { show, node } = useToast();
  const admin = session?.user.role === 'admin';

  useEffect(() => {
    if (ready && session && admin) void call<School>('/school').then(setSchool).catch(() => show('Não foi possível carregar a escola.', 'bad'));
  }, [ready, session, admin, call, show]);

  async function saveSchool(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget); setBusy('school'); setErrors((x) => ({ ...x, school: undefined }));
    try {
      await call('/school', { method: 'PUT', body: JSON.stringify({ name: f.get('name'), min_exit_time: f.get('min_exit_time'), late_after: f.get('late_after') }) });
      show('Escola guardada');
    } catch (err) { setErrors((x) => ({ ...x, school: errText(err) })); }
    setBusy(null);
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget; const f = new FormData(form);
    if (f.get('next') !== f.get('again')) return setErrors((x) => ({ ...x, pass: 'As duas senhas novas não coincidem.' }));
    setBusy('pass'); setErrors((x) => ({ ...x, pass: undefined }));
    try { await call('/auth/change-password', { method: 'POST', body: JSON.stringify({ current: f.get('current'), next: f.get('next') }) }); form.reset(); show('Senha alterada'); }
    catch (err) { setErrors((x) => ({ ...x, pass: errText(err) })); }
    setBusy(null);
  }

  return (
    <section>
      <PageHeader title="Definições" subtitle={admin ? 'Horários da escola e a sua conta.' : 'A sua conta.'} />
      <div className="flex flex-col gap-6">
        {admin && (
          school === null ? <div className="card skeleton h-64" /> : (
            <FormPanel onSubmit={saveSchool} busy={busy === 'school'} error={errors.school} submitLabel="Guardar escola" busyLabel="A guardar" footnote={`Fuso horário: ${school.timezone}`}>
              <FormSection aside title="Escola" description="O nome aparece no painel e nos avisos às famílias.">
                <Field label="Nome da escola"><input name="name" required maxLength={120} defaultValue={school.name} className="input" /></Field>
              </FormSection>
              <FormSection aside columns={2} title="Horários" description="Decidem o que conta como atraso e a partir de quando uma saída é aceite na portaria.">
                <Field label="Atraso a partir das" hint="Entradas depois desta hora ficam marcadas como atraso."><input name="late_after" type="time" required defaultValue={school.late_after} className="input" /></Field>
                <Field label="Saída aceite a partir das" hint="Evita saídas registadas por toque duplo de manhã."><input name="min_exit_time" type="time" required defaultValue={school.min_exit_time} className="input" /></Field>
              </FormSection>
            </FormPanel>
          )
        )}

        <FormPanel onSubmit={changePassword} busy={busy === 'pass'} error={errors.pass} submitLabel="Alterar senha" busyLabel="A guardar">
          <FormSection aside title="Senha" description="Use pelo menos 8 caracteres. Quem recebeu uma senha temporária deve trocá-la aqui.">
            <Field label="Senha atual"><input name="current" type="password" required autoComplete="current-password" className="input" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nova senha"><input name="next" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
              <Field label="Repetir nova senha"><input name="again" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
            </div>
          </FormSection>
        </FormPanel>
      </div>
      {node}
    </section>
  );
}
