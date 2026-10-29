'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth';
import { Avatar } from '@/components/ui';
import { Credentials, errText, PageHeader, useToast } from '@/components/kit';
import { DoneDialog, Field, FormDialog, FormSection, UsernameField } from '@/components/form';
import { cmp, FilterTabs, nextSort, SearchField, SortHeader, TableEmpty, TableFooter, TableHead, TableSkeleton, Th, usePager, type Sort } from '@/components/table';

interface Guardian { id: number; name: string; username: string; email: string | null; phone: string | null; active: number; students: { id: number; name: string }[]; push_devices: number }
interface Student { id: number; name: string; active: number }

type GFilter = 'all' | 'push' | 'nopush' | 'inactive';
type SortKey = 'name' | 'students' | 'push';
const G_FILTERS: Array<{ key: GFilter; label: string; tone?: string }> = [
  { key: 'all', label: 'Ativos' }, { key: 'push', label: 'Recebem avisos', tone: 'var(--ok)' },
  { key: 'nopush', label: 'Sem avisos', tone: 'var(--late)' }, { key: 'inactive', label: 'Inativos', tone: 'var(--gone)' },
];
const matches = (g: Guardian, f: GFilter) =>
  f === 'inactive' ? !g.active : !!g.active && (f === 'all' || (f === 'push' ? g.push_devices > 0 : g.push_devices === 0));

function StudentPicker({ students, selected, onChange }: { students: Student[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [q, setQ] = useState('');
  const list = students.filter((s) => s.active && s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar aluno" aria-label="Procurar aluno" className="input" />
      <ul className="max-h-52 divide-y divide-line overflow-auto rounded-xl border border-line">
        {list.length === 0 && <li className="p-3 text-footnote text-muted">Nenhum aluno encontrado.</li>}
        {list.map((s) => (
          <li key={s.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => onChange(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))} className="h-4 w-4 accent-[var(--brand)]" />
              {s.name}
            </label>
          </li>
        ))}
      </ul>
      <p className="text-footnote text-muted">{selected.length} {selected.length === 1 ? 'educando escolhido' : 'educandos escolhidos'}</p>
    </div>
  );
}

export default function Encarregados() {
  const { session, ready, call } = useSession();
  const [guardians, setGuardians] = useState<Guardian[] | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const pager = usePager();
  const [query, setQueryRaw] = useState('');
  const [filter, setFilterRaw] = useState<GFilter>('all');
  const [sort, setSortRaw] = useState<Sort<SortKey>>({ key: 'name', dir: 1 });
  // Qualquer mudança de filtro ou ordem volta à primeira página.
  const setQuery = (v: string) => { setQueryRaw(v); pager.reset(); };
  const setFilter = (v: GFilter) => { setFilterRaw(v); pager.reset(); };
  const onSort = (k: SortKey) => { setSortRaw((s) => nextSort(s, k)); pager.reset(); };
  const clear = () => { setFilter('all'); setQuery(''); };
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Guardian | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ title: string; who: string; username: string; password: string } | null>(null);
  const { show, node } = useToast();

  const load = useCallback(async () => {
    const [g, s] = await Promise.all([call<Guardian[]>('/guardians'), call<Student[]>('/students')]);
    setGuardians(g); setStudents(s);
  }, [call]);
  useEffect(() => { if (ready && session) void load().catch(() => show('Não foi possível carregar os dados.', 'bad')); }, [ready, session, load, show]);

  const counts = useMemo(() => Object.fromEntries(G_FILTERS.map((f) => [f.key, (guardians ?? []).filter((g) => matches(g, f.key)).length])) as Record<GFilter, number>, [guardians]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const val = (g: Guardian) => sort.key === 'name' ? g.name : sort.key === 'students' ? g.students.length : g.push_devices;
    return (guardians ?? [])
      .filter((g) => matches(g, filter) && (!q || g.name.toLowerCase().includes(q) || g.username.includes(q) || (g.email ?? '').toLowerCase().includes(q) || g.students.some((s) => s.name.toLowerCase().includes(q))))
      .sort((a, b) => (cmp(val(a), val(b)) || cmp(a.name, b.name)) * sort.dir);
  }, [guardians, query, filter, sort]);
  const filtered = filter !== 'all' || !!query;
  const { rows: page } = pager.slice(shown);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    if (picked.length === 0) return setFormError('Escolha pelo menos um educando.');
    setBusy(true); setFormError(null);
    try {
      const r = await call<{ username: string; temporary_password: string }>('/guardians', { method: 'POST', body: JSON.stringify({ name: f.get('name'), username: f.get('username') || undefined, email: f.get('email') || undefined, phone: f.get('phone') || undefined, student_ids: picked }) });
      setCreating(false); setPicked([]); setSecret({ title: 'Encarregado criado', who: String(f.get('name')), username: r.username, password: r.temporary_password }); await load();
    } catch (err) { setFormError(errText(err)); }
    setBusy(false);
  }

  async function saveLinks() {
    if (!editing) return; setBusy(true); setFormError(null);
    try { await call(`/guardians/${editing.id}/students`, { method: 'PUT', body: JSON.stringify({ student_ids: picked }) }); setEditing(null); await load(); show('Educandos atualizados'); }
    catch (err) { setFormError(errText(err)); }
    setBusy(false);
  }

  async function reset(g: Guardian) {
    try { const r = await call<{ temporary_password: string }>(`/users/${g.id}/reset-password`, { method: 'POST' }); setSecret({ title: 'Nova senha temporária', who: g.name, username: g.username, password: r.temporary_password }); }
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
        action={<button onClick={() => { setPicked([]); setFormError(null); setCreating(true); }} className="btn btn-primary">Adicionar encarregado</button>}
      />
      <section className="card overflow-hidden" aria-labelledby="lista-encarregados">
        <TableHead id="lista-encarregados" title="Lista de encarregados" subtitle="Quem não recebe avisos ainda não ativou as notificações no telemóvel.">
          <FilterTabs label="Filtrar encarregados" value={filter} onChange={setFilter} options={G_FILTERS.map((f) => ({ ...f, count: counts[f.key] }))} />
          <SearchField value={query} onChange={setQuery} placeholder="Nome, utilizador ou educando" className="sm:w-72" />
        </TableHead>

        {guardians === null ? <TableSkeleton n={4} /> : shown.length === 0 ? (
          <TableEmpty
            title={guardians.length === 0 ? 'Ainda não há encarregados' : 'Nenhum encarregado corresponde aos filtros'}
            hint={guardians.length === 0 ? 'Crie a conta, ligue-a aos educandos e entregue a senha temporária.' : 'Mude o filtro ou a pesquisa.'}
            onClear={filtered && guardians.length > 0 ? clear : undefined}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-left text-xs text-muted">
                  <tr>
                    <SortHeader k="name" label="Encarregado" sort={sort} onSort={onSort} className="pl-5" />
                    <Th>Telemóvel</Th>
                    <SortHeader k="students" label="Educandos" sort={sort} onSort={onSort} />
                    <SortHeader k="push" label="Avisos" sort={sort} onSort={onSort} />
                    <Th className="pr-5"><span className="sr-only">Ações</span></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {page.map((g) => (
                    <tr key={g.id} className="hover:bg-surface-2/50">
                      <td className="py-2.5 pl-5 pr-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={g.name} size={32} />
                          <div className="min-w-0">
                            <p className={`truncate font-medium ${g.active ? '' : 'text-muted'}`}>{g.name}</p>
                            <p className="truncate text-xs text-muted"><span className="font-mono">{g.username}</span>{g.email ? ` · ${g.email}` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted">{g.phone ?? '–'}</td>
                      <td className="max-w-64 px-3 py-2.5">
                        {g.students.length ? <span className="line-clamp-2">{g.students.map((s) => s.name).join(', ')}</span> : <span className="text-muted/60">Nenhum ligado</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {!g.active ? <span className="pill" style={{ ['--tone' as string]: 'var(--gone)' }}>Inativo</span>
                          : <span className="pill whitespace-nowrap" style={{ ['--tone' as string]: g.push_devices ? 'var(--ok)' : 'var(--late)' }}>{g.push_devices ? `${g.push_devices} ${g.push_devices === 1 ? 'aparelho' : 'aparelhos'}` : 'Sem avisos'}</span>}
                      </td>
                      <td className="py-2.5 pl-3 pr-5">
                        <div className="flex justify-end gap-0.5">
                          <button onClick={() => { setEditing(g); setFormError(null); setPicked(g.students.map((s) => s.id)); }} className="btn btn-quiet text-sm">Educandos</button>
                          <button onClick={() => reset(g)} className="btn btn-quiet whitespace-nowrap text-sm">Nova senha</button>
                          <button onClick={() => toggle(g)} className="btn btn-quiet text-sm">{g.active ? 'Desativar' : 'Ativar'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {page.map((g) => (
                <li key={g.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={g.name} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-medium ${g.active ? '' : 'text-muted'}`}>{g.name}</p>
                      <p className="truncate text-xs text-muted"><span className="font-mono">{g.username}</span>{g.email ? ` · ${g.email}` : ''}</p>
                    </div>
                    <span className="pill shrink-0" style={{ ['--tone' as string]: !g.active ? 'var(--gone)' : g.push_devices ? 'var(--ok)' : 'var(--late)' }}>{!g.active ? 'Inativo' : g.push_devices ? 'Avisos' : 'Sem avisos'}</span>
                  </div>
                  <p className="text-xs text-muted">{g.students.length ? g.students.map((s) => s.name).join(', ') : 'Nenhum educando ligado'}</p>
                  <div className="-ml-2 flex gap-0.5">
                    <button onClick={() => { setEditing(g); setFormError(null); setPicked(g.students.map((s) => s.id)); }} className="btn btn-quiet text-sm">Educandos</button>
                    <button onClick={() => reset(g)} className="btn btn-quiet text-sm">Nova senha</button>
                    <button onClick={() => toggle(g)} className="btn btn-quiet text-sm">{g.active ? 'Desativar' : 'Ativar'}</button>
                  </div>
                </li>
              ))}
            </ul>

            <TableFooter pager={pager} total={shown.length} noun={['encarregado', 'encarregados']} onClear={filtered ? clear : undefined} />
          </>
        )}
      </section>

      {creating && (
        <FormDialog
          title="Adicionar encarregado" subtitle="A conta é criada com uma senha temporária, mostrada no fim."
          onClose={() => setCreating(false)} onSubmit={create} busy={busy} error={formError}
          submitLabel="Criar encarregado" busyLabel="A criar"
        >
          <FormSection title="Contacto">
            <Field label="Nome completo"><input name="name" required autoFocus maxLength={120} autoComplete="off" className="input" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" optional hint="Só para contacto."><input name="email" type="email" autoComplete="off" className="input" /></Field>
              <Field label="Telemóvel" optional><input name="phone" type="tel" autoComplete="off" placeholder="+238 …" className="input" /></Field>
            </div>
            <UsernameField />
          </FormSection>
          <FormSection title="Educandos" description="Os alunos de quem esta pessoa recebe avisos.">
            <StudentPicker students={students} selected={picked} onChange={setPicked} />
          </FormSection>
        </FormDialog>
      )}
      {editing && (
        <FormDialog
          title="Educandos" subtitle={editing.name}
          onClose={() => setEditing(null)} onSubmit={saveLinks} busy={busy} error={formError}
          submitLabel="Guardar educandos" busyLabel="A guardar"
        >
          <FormSection description="Os alunos de quem esta pessoa recebe avisos.">
            <StudentPicker students={students} selected={picked} onChange={setPicked} />
          </FormSection>
        </FormDialog>
      )}
      {secret && (
        <DoneDialog title={secret.title} subtitle={secret.who} onClose={() => setSecret(null)}>
          <Credentials username={secret.username} password={secret.password} note="Mostrada só agora. Entregue-a ao encarregado; no primeiro acesso ele deve trocá-la em Definições." />
        </DoneDialog>
      )}
      {node}
    </section>
  );
}
