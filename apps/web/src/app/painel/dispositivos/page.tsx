'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/auth';
import { Empty, errText, PageHeader, Secret, SkeletonRows, useToast } from '@/components/kit';
import { ChoiceGroup, ConfirmDialog, DoneDialog, Field, FormDialog, FormSection } from '@/components/form';

interface Device { id: number; name: string; location: 'gate' | 'canteen'; active: number; last_seen_at: string | null }
const PLACE = { gate: 'Portaria', canteen: 'Cantina' } as const;

const ago = (v: string | null) => {
  if (!v) return null;
  const s = Math.max(0, Math.round((Date.now() - new Date(v.replace(' ', 'T') + 'Z').getTime()) / 1000));
  if (s < 90) return { text: 'agora mesmo', live: true };
  if (s < 3600) return { text: `há ${Math.round(s / 60)} min`, live: false };
  if (s < 86400) return { text: `há ${Math.round(s / 3600)} h`, live: false };
  return { text: `há ${Math.round(s / 86400)} dias`, live: false };
};

export default function Dispositivos() {
  const { session, ready, call } = useSession();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<Device | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const { show, node } = useToast();

  const load = useCallback(async () => setDevices(await call<Device[]>('/devices')), [call]);
  useEffect(() => {
    if (!ready || !session) return;
    void load().catch(() => show('Não foi possível carregar os dispositivos.', 'bad'));
    const id = setInterval(() => void load().catch(() => {}), 20_000);
    return () => clearInterval(id);
  }, [ready, session, load, show]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget); setBusy(true); setFormError(null);
    try {
      const r = await call<{ token: string }>('/devices', { method: 'POST', body: JSON.stringify({ name: f.get('name'), location: f.get('location') }) });
      setAdding(false); setCreated({ name: String(f.get('name')), token: r.token }); await load();
    } catch (err) { setFormError(errText(err)); }
    setBusy(false);
  }

  async function revoke(d: Device) {
    setBusy(true); setFormError(null);
    try { await call(`/devices/${d.id}`, { method: 'DELETE' }); setRevoking(null); await load(); show('Dispositivo desativado'); }
    catch (err) { setFormError(errText(err)); }
    setBusy(false);
  }

  return (
    <section>
      <PageHeader
        title="Dispositivos"
        subtitle="Cada telemóvel Android com NFC que lê cartões na portaria ou na cantina."
        action={<button onClick={() => { setFormError(null); setAdding(true); }} className="btn btn-primary">Novo dispositivo</button>}
      />

      <div className="card overflow-hidden">
        {devices === null ? <SkeletonRows n={2} /> : devices.length === 0 ? (
          <Empty title="Ainda não há dispositivos" hint="Crie um dispositivo, copie o token e cole-o em /kiosk no telemóvel Android." />
        ) : (
          <ul>{devices.map((d, i) => {
            const seen = ago(d.last_seen_at);
            return (
              <li key={d.id} className="anim-rise flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${d.active ? '' : 'text-muted line-through'}`}>{d.name}</p>
                  <p className="text-xs text-muted">{PLACE[d.location]} · {seen ? `visto ${seen.text}` : 'ainda não ligou'}</p>
                </div>
                {d.active
                  ? <span className="pill" style={{ ['--tone' as string]: seen?.live ? 'var(--ok)' : 'var(--gone)' }}>{seen?.live ? 'Online' : 'Offline'}</span>
                  : <span className="pill" style={{ ['--tone' as string]: 'var(--bad)' }}>Desativado</span>}
                {d.active ? <button onClick={() => { setFormError(null); setRevoking(d); }} className="btn btn-quiet text-sm text-bad hover:bg-bad-bg">Desativar</button> : null}
              </li>
            );
          })}</ul>
        )}
      </div>

      {adding && (
        <FormDialog
          title="Novo dispositivo" subtitle="No fim recebe o token que liga o telemóvel a esta escola."
          onClose={() => setAdding(false)} onSubmit={add} busy={busy} error={formError}
          submitLabel="Criar dispositivo" busyLabel="A criar"
        >
          <FormSection>
            <Field label="Nome do aparelho" hint="Para o reconhecer na lista."><input name="name" required autoFocus maxLength={60} placeholder="Ex.: Portaria principal" autoComplete="off" className="input" /></Field>
            <ChoiceGroup
              name="location" label="Onde fica" defaultValue="gate"
              options={[
                { value: 'gate', label: 'Portaria', hint: 'Regista entradas e saídas' },
                { value: 'canteen', label: 'Cantina', hint: 'Regista o almoço' },
              ]}
            />
          </FormSection>
        </FormDialog>
      )}
      {revoking && (
        <ConfirmDialog
          title={`Desativar ${revoking.name}?`} confirmLabel="Desativar dispositivo" busyLabel="A desativar" busy={busy}
          onConfirm={() => revoke(revoking)} onClose={() => setRevoking(null)}
        >
          O aparelho deixa de registar toques. Para voltar a usá-lo, crie um dispositivo novo e cole o novo token.
          {formError && <p className="mt-3 text-footnote text-bad">{formError}</p>}
        </ConfirmDialog>
      )}
      {created && (
        <DoneDialog title="Dispositivo criado" subtitle={created.name} onClose={() => setCreated(null)}>
          <Secret label="Token do dispositivo" value={created.token} note="Mostrado só agora. Guardamos apenas uma cópia cifrada." />
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-footnote text-muted">
            <li>No telemóvel, abra o Chrome em <code className="font-mono text-ink">{typeof window !== 'undefined' ? window.location.origin : ''}/kiosk</code>.</li>
            <li>Cole o token e toque em Guardar e continuar.</li>
            <li>Toque em Iniciar leitura e deixe o ecrã ligado.</li>
          </ol>
        </DoneDialog>
      )}
      {node}
    </section>
  );
}
