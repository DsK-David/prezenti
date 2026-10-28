'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/auth';
import { Empty, errText, Field, Modal, PageHeader, Secret, SkeletonRows, Submit, useToast } from '@/components/kit';

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
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setBusy(true);
    try {
      const r = await call<{ token: string }>('/devices', { method: 'POST', body: JSON.stringify({ name: f.get('name'), location: f.get('location') }) });
      setCreated({ name: String(f.get('name')), token: r.token }); form.reset(); await load();
    } catch (err) { show(errText(err), 'bad'); }
    setBusy(false);
  }

  async function revoke(d: Device) {
    if (!confirm(`Desativar ${d.name}? O aparelho deixa de registar toques.`)) return;
    try { await call(`/devices/${d.id}`, { method: 'DELETE' }); await load(); show('Dispositivo desativado'); } catch (err) { show(errText(err), 'bad'); }
  }

  return (
    <section>
      <PageHeader title="Dispositivos" subtitle="Cada telemóvel Android com NFC que lê cartões na portaria ou na cantina." />
      <form onSubmit={add} className="card anim-rise mb-6 grid gap-3 p-4 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
        <Field label="Nome do aparelho"><input name="name" required maxLength={60} placeholder="Ex.: Portaria principal" className="input" /></Field>
        <Field label="Onde fica"><select name="location" className="input"><option value="gate">Portaria (entrada e saída)</option><option value="canteen">Cantina (almoço)</option></select></Field>
        <Submit busy={busy} busyText="A criar">Criar dispositivo</Submit>
      </form>

      <div className="card overflow-hidden">
        {devices === null ? <SkeletonRows n={2} /> : devices.length === 0 ? (
          <Empty title="Ainda não há dispositivos" hint="Crie um, copie o token e cole-o em /kiosk no telemóvel Android." />
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
                {d.active ? <button onClick={() => revoke(d)} className="btn btn-quiet px-2 text-sm text-bad">Desativar</button> : null}
              </li>
            );
          })}</ul>
        )}
      </div>

      {created && (
        <Modal title="Dispositivo criado" subtitle={created.name} onClose={() => setCreated(null)}>
          <Secret label="Token do dispositivo" value={created.token} note="Mostrado só agora. Guardamos apenas uma cópia cifrada." />
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
            <li>No telemóvel, abra o Chrome em <code className="font-mono text-ink">{typeof window !== 'undefined' ? window.location.origin : ''}/kiosk</code>.</li>
            <li>Cole o token e toque em Guardar e continuar.</li>
            <li>Toque em Iniciar leitura e deixe o ecrã ligado.</li>
          </ol>
          <button onClick={() => setCreated(null)} className="btn btn-primary">Feito</button>
        </Modal>
      )}
      {node}
    </section>
  );
}
