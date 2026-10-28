'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth';
import { errText, Field, PageHeader, Submit, useToast } from '@/components/kit';

interface School { name: string; timezone: string; min_exit_time: string; late_after: string }

export default function Definicoes() {
  const { session, ready, call } = useSession();
  const [school, setSchool] = useState<School | null>(null);
  const [busy, setBusy] = useState<'school' | 'pass' | null>(null);
  const { show, node } = useToast();
  const admin = session?.user.role === 'admin';

  useEffect(() => {
    if (ready && session && admin) void call<School>('/school').then(setSchool).catch(() => show('Não foi possível carregar a escola.', 'bad'));
  }, [ready, session, admin, call, show]);

  async function saveSchool(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy('school');
    try {
      await call('/school', { method: 'PUT', body: JSON.stringify({ name: f.get('name'), min_exit_time: f.get('min_exit_time'), late_after: f.get('late_after') }) });
      show('Escola guardada');
    } catch (err) { show(errText(err), 'bad'); }
    setBusy(null);
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    if (f.get('next') !== f.get('again')) return show('As duas senhas novas não coincidem.', 'bad');
    setBusy('pass');
    try { await call('/auth/change-password', { method: 'POST', body: JSON.stringify({ current: f.get('current'), next: f.get('next') }) }); form.reset(); show('Senha alterada'); }
    catch (err) { show(errText(err), 'bad'); }
    setBusy(null);
  }

  return (
    <section>
      <PageHeader title="Definições" subtitle={admin ? 'Horários da escola e a sua conta.' : 'A sua conta.'} />
      <div className="grid max-w-3xl gap-6">
        {admin && (
          <form onSubmit={saveSchool} className="card anim-rise flex flex-col gap-4 p-6">
            <div><h2 className="font-display text-xl">Escola</h2><p className="text-sm text-muted">Estes horários decidem o que conta como atraso e a partir de quando uma saída é aceite.</p></div>
            {school === null ? <div className="skeleton h-40" /> : (
              <>
                <Field label="Nome da escola"><input name="name" required defaultValue={school.name} className="input" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Atraso a partir das" hint="Entradas depois desta hora ficam marcadas como atraso."><input name="late_after" type="time" required defaultValue={school.late_after} className="input" /></Field>
                  <Field label="Saída aceite a partir das" hint="Evita saídas registadas por toque duplo de manhã."><input name="min_exit_time" type="time" required defaultValue={school.min_exit_time} className="input" /></Field>
                </div>
                <p className="text-xs text-muted">Fuso horário da escola: {school.timezone}</p>
                <div className="flex justify-end"><Submit busy={busy === 'school'} busyText="A guardar">Guardar escola</Submit></div>
              </>
            )}
          </form>
        )}

        <form onSubmit={changePassword} className="card anim-rise flex flex-col gap-4 p-6" style={{ animationDelay: '60ms' }}>
          <div><h2 className="font-display text-xl">Senha</h2><p className="text-sm text-muted">Use pelo menos 8 caracteres.</p></div>
          <Field label="Senha atual"><input name="current" type="password" required autoComplete="current-password" className="input" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nova senha"><input name="next" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
            <Field label="Repetir nova senha"><input name="again" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
          </div>
          <div className="flex justify-end"><Submit busy={busy === 'pass'} busyText="A guardar">Alterar senha</Submit></div>
        </form>
      </div>
      {node}
    </section>
  );
}
