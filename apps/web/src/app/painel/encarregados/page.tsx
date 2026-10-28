'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth';
import { Avatar } from '@/components/ui';
import { Empty, errText, Field, Modal, PageHeader, Secret, SkeletonRows, Submit, useToast } from '@/components/kit';

interface Guardian { id: number; name: string; email: string; phone: string | null; active: number; students: { id: number; name: string }[]; push_devices: number }
interface Student { id: number; name: string; active: number }

function StudentPicker({ students, selected, onChange }: { students: Student[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [q, setQ] = useState('');
  const list = students.filter((s) => s.active && s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar aluno" aria-label="Procurar aluno" className="input py-2" />
      <ul className="max-h-48 overflow-auto rounded-xl border border-line">
        {list.length === 0 && <li className="p-3 text-sm text-muted">Nenhum aluno encontrado.</li>}
        {list.map((s) => (
          <li key={s.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => onChange(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))} className="h-4 w-4 accent-[var(--brand)]" />
              {s.name}
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{selected.length} {selected.length === 1 ? 'educando escolhido' : 'educandos escolhidos'}</p>
    </div>
  );
}

export default function Encarregados() {
  const { session, ready, call } = useSession();
  const [guardians, setGuardians] = useState<Guardian[] | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Guardian | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ title: string; who: string; password: string } | null>(null);
  const { show, node } = useToast();

  const load = useCallback(async () => {
    const [g, s] = await Promise.all([call<Guardian[]>('/guardians'), call<Student[]>('/students')]);
    setGuardians(g); setStudents(s);
  }, [call]);
  useEffect(() => { if (ready && session) void load().catch(() => show('Não foi possível carregar os dados.', 'bad')); }, [ready, session, load, show]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (guardians ?? []).filter((g) => !q || g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q) || g.students.some((s) => s.name.toLowerCase().includes(q)));
  }, [guardians, query]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    if (picked.length === 0) return show('Escolha pelo menos um educando.', 'bad');
    setBusy(true);
    try {
      const r = await call<{ temporary_password: string }>('/guardians', { method: 'POST', body: JSON.stringify({ name: f.get('name'), email: f.get('email'), phone: f.get('phone') || undefined, student_ids: picked }) });
      setCreating(false); setPicked([]); setSecret({ title: 'Encarregado criado', who: String(f.get('name')), password: r.temporary_password }); await load();
    } catch (err) { show(errText(err), 'bad'); }
    setBusy(false);
  }

  async function saveLinks() {
    if (!editing) return; setBusy(true);
    try { await call(`/guardians/${editing.id}/students`, { method: 'PUT', body: JSON.stringify({ student_ids: picked }) }); setEditing(null); await load(); show('Educandos atualizados'); }
    catch (err) { show(errText(err), 'bad'); }
    setBusy(false);
  }

  async function reset(g: Guardian) {
    try { const r = await call<{ temporary_password: string }>(`/users/${g.id}/reset-password`, { method: 'POST' }); setSecret({ title: 'Nova senha temporária', who: g.name, password: r.temporary_password }); }
    catch (err) { show(errText(err), 'bad'); }
  }
  async function toggle(g: Guardian) {
    try { await call(`/users/${g.id}`, { method: 'PATCH', body: JSON.stringify({ active: !g.active }) }); await load(); show(g.active ? 'Encarregado desativado' : 'Encarregado ativado'); }
    catch (err) { show(errText(err), 'bad'); }
  }

  const withPush = guardians?.filter((g) => g.push_devices > 0).length ?? 0;

  return (
    <section>
      <PageHeader
        title="Encarregados"
        subtitle={guardians ? `${guardians.length} encarregados · ${withPush} com notificações ativas` : 'A carregar'}
        action={<button onClick={() => { setPicked([]); setCreating(true); }} className="btn btn-primary">Adicionar encarregado</button>}
      />
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar por nome, email ou educando" aria-label="Procurar" className="input mb-4 max-w-md" />

      <div className="card overflow-hidden">
        {guardians === null ? <SkeletonRows n={4} /> : shown.length === 0 ? (
          <Empty title={guardians.length === 0 ? 'Ainda não há encarregados' : 'Nenhum resultado'} hint={guardians.length === 0 ? 'Crie a conta, ligue-a aos educandos e entregue a senha temporária.' : 'Tente outro nome.'} />
        ) : (
          <ul>{shown.map((g, i) => (
            <li key={g.id} className="anim-rise flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-0" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <Avatar name={g.name} />
              <div className="min-w-0 flex-1 basis-56">
                <p className={`truncate font-medium ${g.active ? '' : 'text-muted line-through'}`}>{g.name}</p>
                <p className="truncate text-xs text-muted">{g.email}{g.phone ? ` · ${g.phone}` : ''}</p>
                <p className="mt-1 text-xs text-muted">{g.students.length ? g.students.map((s) => s.name).join(', ') : 'Sem educandos ligados'}</p>
              </div>
              <span className="pill" style={{ ['--tone' as string]: g.push_devices ? 'var(--ok)' : 'var(--gone)' }}>{g.push_devices ? 'Notificações ativas' : 'Sem notificações'}</span>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(g); setPicked(g.students.map((s) => s.id)); }} className="btn btn-quiet px-2 text-sm">Educandos</button>
                <button onClick={() => reset(g)} className="btn btn-quiet px-2 text-sm">Nova senha</button>
                <button onClick={() => toggle(g)} className="btn btn-quiet px-2 text-sm">{g.active ? 'Desativar' : 'Ativar'}</button>
              </div>
            </li>))}</ul>
        )}
      </div>

      {creating && (
        <Modal title="Adicionar encarregado" subtitle="A conta é criada com uma senha temporária." onClose={() => setCreating(false)}>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Field label="Nome"><input name="name" required autoFocus className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Field label="Telemóvel (opcional)"><input name="phone" type="tel" className="input" /></Field>
            <Field label="Educandos"><StudentPicker students={students} selected={picked} onChange={setPicked} /></Field>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="btn btn-ghost">Cancelar</button><Submit busy={busy} busyText="A criar">Criar encarregado</Submit></div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal title="Educandos" subtitle={editing.name} onClose={() => setEditing(null)}>
          <StudentPicker students={students} selected={picked} onChange={setPicked} />
          <div className="flex justify-end gap-2"><button onClick={() => setEditing(null)} className="btn btn-ghost">Cancelar</button><button onClick={saveLinks} disabled={busy} className="btn btn-primary">Guardar educandos</button></div>
        </Modal>
      )}
      {secret && (
        <Modal title={secret.title} subtitle={secret.who} onClose={() => setSecret(null)}>
          <Secret label="Senha temporária" value={secret.password} note="Mostrada só agora. Entregue-a ao encarregado; no primeiro acesso ele deve trocá-la em Definições." />
          <button onClick={() => setSecret(null)} className="btn btn-primary">Feito</button>
        </Modal>
      )}
      {node}
    </section>
  );
}
