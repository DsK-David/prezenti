'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth';
import { Avatar } from '@/components/ui';
import { Credentials, errText, PageHeader, useToast } from '@/components/kit';
import { DoneDialog, Field, FormDialog, FormSection, Switch, UsernameField } from '@/components/form';
import { CardUidField } from '@/components/nfc';
import { cmp, FilterTabs, nextSort, SearchField, SortHeader, TableEmpty, TableFooter, TableHead, TableSkeleton, Th, usePager, type Sort } from '@/components/table';
import { download, parseCsv, toCsv, toImportRows, type ImportRow } from '@/lib/csv';

interface Student { id: number; name: string; class_id: number | null; card_uid: string | null; active: number }
interface ClassRow { id: number; name: string }
interface Unknown { id: number; card_uid: string; seen_at: string }
type CardFilter = 'all' | 'card' | 'nocard' | 'inactive';
type SortKey = 'name' | 'class' | 'card';
const CARD_FILTERS: Array<{ key: CardFilter; label: string; tone?: string }> = [
  { key: 'all', label: 'Ativos' }, { key: 'card', label: 'Com cartão', tone: 'var(--ok)' },
  { key: 'nocard', label: 'Sem cartão', tone: 'var(--late)' }, { key: 'inactive', label: 'Inativos', tone: 'var(--gone)' },
];
const matches = (s: Student, f: CardFilter) =>
  f === 'inactive' ? !s.active : !!s.active && (f === 'all' || (f === 'card' ? !!s.card_uid : !s.card_uid));

interface ImportResult { students: number; classes: number; guardians: number; links: number; credentials: { name: string; username: string; temporary_password: string }[]; errors: { row: number; name: string; error: string }[] }

export default function Alunos() {
  const { session, ready, call } = useSession();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [unknown, setUnknown] = useState<Unknown[]>([]);
  const pager = usePager();
  const [query, setQueryRaw] = useState('');
  const [filter, setFilterRaw] = useState<CardFilter>('all');
  const [klass, setKlassRaw] = useState('');
  const [sort, setSortRaw] = useState<Sort<SortKey>>({ key: 'name', dir: 1 });
  // Qualquer mudança de filtro ou ordem volta à primeira página.
  const setQuery = (v: string) => { setQueryRaw(v); pager.reset(); };
  const setFilter = (v: CardFilter) => { setFilterRaw(v); pager.reset(); };
  const setKlass = (v: string) => { setKlassRaw(v); pager.reset(); };
  const onSort = (k: SortKey) => { setSortRaw((s) => nextSort(s, k)); pager.reset(); };
  const clear = () => { setFilter('all'); setQuery(''); setKlass(''); };
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [importing, setImporting] = useState(false);
  const [creds, setCreds] = useState<{ who: string; username: string; password: string } | null>(null);
  const { show, node } = useToast();

  const load = useCallback(async () => {
    const [s, c, u] = await Promise.all([call<Student[]>('/students'), call<ClassRow[]>('/classes'), call<Unknown[]>('/unknown-cards')]);
    setStudents(s); setClasses(c); setUnknown(u);
  }, [call]);

  useEffect(() => {
    if (!ready || !session) return;
    void load().catch(() => show('Não foi possível carregar os dados. Atualize a página.', 'bad'));
    const id = setInterval(() => void load().catch(() => {}), 15_000); // cartões desconhecidos aparecem sozinhos
    return () => clearInterval(id);
  }, [ready, session, load, show]);

  const active = useMemo(() => students?.filter((s) => s.active) ?? [], [students]);
  const withoutCard = useMemo(() => active.filter((s) => !s.card_uid), [active]);
  const className = useCallback((id: number | null) => classes.find((c) => c.id === id)?.name ?? '', [classes]);
  const inClass = useMemo(() => (students ?? []).filter((s) => !klass || String(s.class_id) === klass), [students, klass]);
  const counts = useMemo(() => Object.fromEntries(CARD_FILTERS.map((f) => [f.key, inClass.filter((s) => matches(s, f.key)).length])) as Record<CardFilter, number>, [inClass]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/:/g, '');
    const val = (s: Student) => sort.key === 'name' ? s.name : sort.key === 'class' ? className(s.class_id) : s.card_uid ?? '';
    return inClass
      .filter((s) => matches(s, filter) && (!q || s.name.toLowerCase().includes(q) || (s.card_uid ?? '').toLowerCase().includes(q)))
      .sort((a, b) => (cmp(val(a), val(b)) || cmp(a.name, b.name)) * sort.dir);
  }, [inClass, filter, query, sort, className]);
  const filtered = filter !== 'all' || !!query || !!klass;
  const { rows: page } = pager.slice(shown);

  async function assign(id: number, uid: string) {
    try { await call(`/students/${id}/card`, { method: 'PUT', body: JSON.stringify({ card_uid: uid }) }); await load(); show('Cartão associado'); }
    catch (e) { show(errText(e, 'Não foi possível associar o cartão.'), 'bad'); }
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget; const f = new FormData(form); setBusy(true); setFormError(null);
    const text = (k: string) => String(f.get(k) ?? '').trim() || undefined;
    try {
      // O servidor cria o encarregado (ou liga ao que já existe, pelo utilizador ou pelo email) junto com o aluno.
      const r = await call<{ id: number; guardian: { name: string; username: string; created: boolean; temporary_password?: string } | null }>('/students', {
        method: 'POST',
        body: JSON.stringify({
          name: f.get('name'), class_id: f.get('class_id') ? Number(f.get('class_id')) : null, card_uid: text('card_uid') ?? null,
          guardian: { name: text('guardian_name'), username: text('guardian_username'), email: text('guardian_email') },
        }),
      });
      form.reset(); setAdding(false); await load();
      if (r.guardian?.created && r.guardian.temporary_password) setCreds({ who: r.guardian.name, username: r.guardian.username, password: r.guardian.temporary_password });
      show(r.guardian && !r.guardian.created ? `Aluno adicionado e ligado a ${r.guardian.name}` : 'Aluno adicionado');
    } catch (err) { setFormError(errText(err, 'Não foi possível adicionar o aluno. Confira os dados e tente de novo.')); }
    setBusy(false);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    if (!editing) return; const f = new FormData(e.currentTarget); setBusy(true); setFormError(null);
    try {
      await call(`/students/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: f.get('name'), class_id: f.get('class_id') ? Number(f.get('class_id')) : null, active: f.get('active') === 'on' }) });
      const uid = String(f.get('card_uid') ?? '').trim();
      if (uid && uid.replace(/:/g, '').toUpperCase() !== editing.card_uid) await call(`/students/${editing.id}/card`, { method: 'PUT', body: JSON.stringify({ card_uid: uid }) });
      setEditing(null); await load(); show('Aluno guardado');
    } catch (err) { setFormError(errText(err)); }
    setBusy(false);
  }

  return (
    <section>
      <PageHeader
        title="Alunos e cartões"
        subtitle={students ? `${active.length} alunos ativos · ${withoutCard.length === 0 ? 'todos com cartão' : `${withoutCard.length} sem cartão`}` : 'A carregar'}
        action={<div className="flex gap-2"><button onClick={() => setImporting(true)} className="btn btn-ghost">Importar CSV</button><button onClick={() => { setFormError(null); setAdding(true); }} className="btn btn-primary">Adicionar aluno</button></div>}
      />

      {unknown.length > 0 && (
        <div className="card anim-rise mb-6 border-brand/40 p-5">
          <div className="flex items-center gap-2"><span className="anim-blink h-2 w-2 rounded-full bg-brand" aria-hidden /><h2 className="font-display text-title3">Cartões por associar</h2></div>
          <p className="mb-3 text-sm text-muted">Foram lidos no kiosk mas não pertencem a nenhum aluno. Escolha quem usa cada um.</p>
          <ul className="flex flex-col gap-2">
            {unknown.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3">
                <code className="rounded-md bg-surface-2 px-2 py-1 font-mono text-sm">{u.card_uid}</code>
                <select defaultValue="" onChange={(e) => e.target.value && assign(Number(e.target.value), u.card_uid)} className="input w-auto min-w-48 py-1.5" aria-label={`Associar cartão ${u.card_uid}`}>
                  <option value="">Associar a…</option>{withoutCard.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="card overflow-hidden" aria-labelledby="lista-alunos">
        <TableHead id="lista-alunos" title="Lista de alunos" subtitle="Procure pelo nome ou pelo número do cartão.">
          <FilterTabs label="Filtrar por cartão" value={filter} onChange={setFilter} options={CARD_FILTERS.map((f) => ({ ...f, count: counts[f.key] }))} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchField value={query} onChange={setQuery} placeholder="Procurar aluno ou cartão" />
            {classes.length > 1 && (
              <select value={klass} onChange={(e) => setKlass(e.target.value)} aria-label="Filtrar por turma" className="input min-h-10 py-2 text-sm sm:w-48">
                <option value="">Todas as turmas</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        </TableHead>

        {students === null ? <TableSkeleton /> : shown.length === 0 ? (
          <TableEmpty
            title={students.length === 0 ? 'Ainda não há alunos' : 'Nenhum aluno corresponde aos filtros'}
            hint={students.length === 0 ? 'Adicione o primeiro aluno ou importe a lista por CSV.' : 'Mude o filtro, a turma ou a pesquisa.'}
            onClear={filtered && students.length > 0 ? clear : undefined}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-left text-xs text-muted">
                  <tr>
                    <SortHeader k="name" label="Aluno" sort={sort} onSort={onSort} className="pl-5" />
                    <SortHeader k="class" label="Turma" sort={sort} onSort={onSort} />
                    <SortHeader k="card" label="Cartão" sort={sort} onSort={onSort} />
                    <Th>Estado</Th>
                    <Th className="pr-5"><span className="sr-only">Ações</span></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {page.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-2/50">
                      <td className="py-2.5 pl-5 pr-3">
                        <div className="flex min-w-0 items-center gap-3"><Avatar name={s.name} size={32} /><span className={`truncate font-medium ${s.active ? '' : 'text-muted'}`}>{s.name}</span></div>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{className(s.class_id) || 'Sem turma'}</td>
                      <td className="px-3 py-2.5">
                        {s.card_uid ? <code className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs">{s.card_uid}</code> : <span className="text-muted/60">Sem cartão</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {!s.active ? <span className="pill" style={{ ['--tone' as string]: 'var(--gone)' }}>Inativo</span>
                          : s.card_uid ? <span className="pill" style={{ ['--tone' as string]: 'var(--ok)' }}>Pronto</span>
                          : <span className="pill" style={{ ['--tone' as string]: 'var(--late)' }}>Falta cartão</span>}
                      </td>
                      <td className="py-2.5 pl-3 pr-5 text-right"><button onClick={() => { setFormError(null); setEditing(s); }} className="btn btn-quiet text-sm">Editar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {page.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={s.name} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${s.active ? '' : 'text-muted'}`}>{s.name}</p>
                    <p className="truncate text-xs text-muted">{className(s.class_id) || 'Sem turma'} · {s.card_uid ?? 'sem cartão'}</p>
                  </div>
                  <button onClick={() => { setFormError(null); setEditing(s); }} className="btn btn-quiet text-sm">Editar</button>
                </li>
              ))}
            </ul>

            <TableFooter pager={pager} total={shown.length} noun={['aluno', 'alunos']} onClear={filtered ? clear : undefined} />
          </>
        )}
      </section>

      {adding && (
        <FormDialog
          title="Adicionar aluno"
          subtitle="O cartão pode ser associado agora ou mais tarde, quando for lido no kiosk."
          onClose={() => setAdding(false)} onSubmit={add} busy={busy} error={formError}
          submitLabel="Adicionar aluno" busyLabel="A adicionar"
        >
          <FormSection title="Aluno">
            <Field label="Nome completo"><input name="name" required autoFocus maxLength={120} autoComplete="off" className="input" /></Field>
            <Field label="Turma"><select name="class_id" className="input"><option value="">Sem turma</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          </FormSection>
          <FormSection title="Cartão">
            <CardUidField optional hint="Pode ficar vazio: o cartão aparece em “por associar” quando for lido no kiosk." />
          </FormSection>
          <FormSection title="Encarregado" description="Opcional. Para um encarregado novo, escreva o nome. Para ligar a um que já existe, basta o nome de utilizador dele.">
            <Field label="Nome" optional><input name="guardian_name" autoComplete="off" className="input" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <UsernameField name="guardian_username" />
              <Field label="Email" optional hint="Só para contacto."><input name="guardian_email" type="email" autoComplete="off" className="input" /></Field>
            </div>
          </FormSection>
        </FormDialog>
      )}
      {editing && (
        <FormDialog
          title="Editar aluno" subtitle={editing.name}
          onClose={() => setEditing(null)} onSubmit={save} busy={busy} error={formError}
          submitLabel="Guardar alterações" busyLabel="A guardar"
        >
          <FormSection title="Aluno">
            <Field label="Nome completo"><input name="name" required maxLength={120} defaultValue={editing.name} className="input" /></Field>
            <Field label="Turma"><select name="class_id" defaultValue={editing.class_id ?? ''} className="input"><option value="">Sem turma</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          </FormSection>
          <FormSection title="Cartão" description="Trocar o UID passa o cartão antigo a desconhecido.">
            <CardUidField defaultValue={editing.card_uid ?? ''} />
          </FormSection>
          <Switch name="active" defaultChecked={!!editing.active} label="Aluno ativo" description="Aparece no painel e o cartão regista entradas. Desligue quando o aluno sair da escola." />
        </FormDialog>
      )}
      {importing && <ImportModal call={call} onClose={() => setImporting(false)} onDone={() => void load()} />}
      {creds && (
        <DoneDialog title="Encarregado criado" subtitle={creds.who} onClose={() => setCreds(null)}>
          <Credentials username={creds.username} password={creds.password} note="Mostrada só agora. Entregue-a ao encarregado; no primeiro acesso ele troca em Definições." />
        </DoneDialog>
      )}
      {node}
    </section>
  );
}

const IMPORT_ERRORS: Record<string, string> = {
  card_in_use: 'cartão já usado por outro aluno',
  email_in_use: 'esse email pertence a outra conta',
  invalid: 'dados inválidos',
};

/** Importação em massa: lê o CSV aqui, mostra o que vai acontecer e só envia quando o gestor confirma. */
function ImportModal({ call, onClose, onDone }: { call: ReturnType<typeof useSession>['call']; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [failed, setFailed] = useState(false);
  const parsed = useMemo(() => (text.trim() ? toImportRows(parseCsv(text)) : null), [text]);
  const rows: ImportRow[] = parsed?.rows ?? [];
  const classes = new Set(rows.map((r) => r.class).filter(Boolean)).size;
  const families = new Set(rows.map((r) => r.guardian_email?.toLowerCase() || r.guardian_name?.toLowerCase()).filter(Boolean)).size;

  async function send() {
    setBusy(true); setFailed(false);
    try { setResult(await call<ImportResult>('/import/students', { method: 'POST', body: JSON.stringify({ rows }) })); onDone(); }
    catch { setFailed(true); }
    setBusy(false);
  }

  const template = () => download('modelo-alunos.csv', toCsv([['nome', 'turma', 'cartao', 'encarregado', 'email'], ['Joana Silva', '1.º A', '04A1B2C3D4E5F6', 'Maria Silva', 'maria@email.cv'], ['Miguel Fortes', '1.º A', '', 'Maria Silva', 'maria@email.cv']]));

  if (result) {
    return (
      <DoneDialog title="Importação concluída" subtitle={`${result.students} ${result.students === 1 ? 'aluno importado' : 'alunos importados'}`} onClose={onClose}>
        <ul className="grid grid-cols-3 gap-2 text-center">
          {[['Alunos', result.students], ['Turmas novas', result.classes], ['Encarregados novos', result.guardians]].map(([l, n]) => (
            <li key={l as string} className="rounded-xl border border-line p-3"><p className="font-display text-figure tabular-nums">{n}</p><p className="text-footnote text-muted">{l}</p></li>
          ))}
        </ul>
        {result.credentials.length > 0 && (
          <div className="rounded-xl border border-brand/25 bg-brand-soft p-4">
            <p className="text-[13px] font-medium text-ink">As senhas temporárias só aparecem agora</p>
            <p className="mt-0.5 text-footnote text-muted">Descarregue a lista e entregue a cada encarregado. Eles trocam a senha no primeiro acesso.</p>
            <button type="button" onClick={() => download('senhas-encarregados.csv', toCsv([['Encarregado', 'Utilizador', 'Senha temporária'], ...result.credentials.map((c) => [c.name, c.username, c.temporary_password])]))} className="btn btn-ghost mt-3 bg-surface">Descarregar senhas (CSV)</button>
          </div>
        )}
        {result.errors.length > 0 && (
          <div>
            <p className="text-[13px] font-medium text-bad">{result.errors.length} {result.errors.length === 1 ? 'linha não foi importada' : 'linhas não foram importadas'}</p>
            <ul className="mt-1 max-h-32 overflow-auto text-footnote text-muted">{result.errors.map((e) => <li key={e.row}>Linha {e.row + 1}, {e.name}: {IMPORT_ERRORS[e.error] ?? e.error}</li>)}</ul>
          </div>
        )}
      </DoneDialog>
    );
  }

  return (
    <FormDialog
      title="Importar alunos por CSV" subtitle="Alunos, turmas e encarregados de uma só vez."
      onClose={onClose} onSubmit={send} busy={busy}
      error={parsed?.error ?? (failed ? 'Não foi possível importar. Verifique o ficheiro e tente de novo.' : null)}
      submitLabel={rows.length ? `Importar ${rows.length} ${rows.length === 1 ? 'aluno' : 'alunos'}` : 'Importar alunos'} busyLabel="A importar"
      submitDisabled={rows.length === 0}
      footnote={rows.length > 0 ? `${classes} ${classes === 1 ? 'turma' : 'turmas'}, ${families} ${families === 1 ? 'encarregado' : 'encarregados'}` : undefined}
    >
      <FormSection title="Formato" description="As turmas que não existirem são criadas. O mesmo encarregado (pelo email ou, sem email, pelo nome) fica ligado a vários filhos e recebe um nome de utilizador.">
        <p className="text-footnote text-muted">Colunas: <span className="font-mono text-ink">nome</span>, <span className="font-mono text-ink">turma</span>, <span className="font-mono text-ink">cartao</span>, <span className="font-mono text-ink">encarregado</span>, <span className="font-mono text-ink">email</span>. Só o nome é obrigatório.</p>
        <button type="button" onClick={template} className="btn btn-ghost w-fit">Descarregar modelo</button>
      </FormSection>
      <FormSection title="Dados">
        <Field label="Ficheiro CSV"><input type="file" accept=".csv,.txt,text/csv" className="input py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2.5 file:py-1 file:text-[13px] file:font-medium" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} /></Field>
        <Field label="Ou cole o conteúdo"><textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="input resize-none font-mono text-footnote" placeholder={'nome;turma;cartao;encarregado;email'} /></Field>
      </FormSection>
    </FormDialog>
  );
}
