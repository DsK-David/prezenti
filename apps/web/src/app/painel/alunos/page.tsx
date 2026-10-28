'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth';
import { Avatar, Spinner } from '@/components/ui';
import { Empty, errText, Field, Modal, PageHeader, Secret, SkeletonRows, Submit, useToast } from '@/components/kit';
import { download, parseCsv, toCsv, toImportRows, type ImportRow } from '@/lib/csv';

interface Student { id: number; name: string; class_id: number | null; card_uid: string | null; active: number }
interface ClassRow { id: number; name: string }
interface Unknown { id: number; card_uid: string; seen_at: string }
interface Guardian { id: number; email: string; students: { id: number }[] }
interface ImportResult { students: number; classes: number; guardians: number; links: number; credentials: { name: string; email: string; temporary_password: string }[]; errors: { row: number; name: string; error: string }[] }

export default function Alunos() {
  const { session, ready, call } = useSession();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [unknown, setUnknown] = useState<Unknown[]>([]);
  const [query, setQuery] = useState('');
  const [onlyNoCard, setOnlyNoCard] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [importing, setImporting] = useState(false);
  const [creds, setCreds] = useState<{ who: string; email: string; password: string } | null>(null);
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
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (students ?? []).filter((s) => (!q || s.name.toLowerCase().includes(q)) && (!onlyNoCard || (!s.card_uid && s.active)));
  }, [students, query, onlyNoCard]);

  async function assign(id: number, uid: string) {
    try { await call(`/students/${id}/card`, { method: 'PUT', body: JSON.stringify({ card_uid: uid }) }); await load(); show('Cartão associado'); }
    catch (e) { show(errText(e, 'Não foi possível associar o cartão.'), 'bad'); }
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setBusy(true);
    try {
      const created = await call<{ id: number }>('/students', { method: 'POST', body: JSON.stringify({ name: f.get('name'), class_id: f.get('class_id') ? Number(f.get('class_id')) : null, card_uid: f.get('card_uid') || null }) });
      // Encarregado opcional: cria a conta e liga ao aluno; se o email já existe, só liga mais um filho.
      const gEmail = String(f.get('guardian_email') ?? '').trim();
      const gName = String(f.get('guardian_name') ?? '').trim() || gEmail;
      let linked = false;
      if (gEmail) {
        try {
          const g = await call<{ temporary_password: string }>('/guardians', { method: 'POST', body: JSON.stringify({ name: gName, email: gEmail, student_ids: [created.id] }) });
          setCreds({ who: gName, email: gEmail, password: g.temporary_password });
        } catch (err) {
          if ((err as Error).message !== 'email_in_use') throw err;
          const ex = (await call<Guardian[]>('/guardians')).find((x) => x.email.toLowerCase() === gEmail.toLowerCase());
          if (!ex) show('Aluno criado, mas esse email pertence a outra conta e não foi ligado.', 'bad');
          else { await call(`/guardians/${ex.id}/students`, { method: 'PUT', body: JSON.stringify({ student_ids: [...ex.students.map((s) => s.id), created.id] }) }); linked = true; }
        }
      }
      form.reset(); setAdding(false); await load(); show(linked ? 'Aluno adicionado e ligado ao encarregado' : 'Aluno adicionado');
    } catch { show('Não foi possível adicionar o aluno. O UID do cartão já pode estar em uso.', 'bad'); }
    setBusy(false);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editing) return; const f = new FormData(e.currentTarget); setBusy(true);
    try {
      await call(`/students/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: f.get('name'), class_id: f.get('class_id') ? Number(f.get('class_id')) : null, active: f.get('active') === 'on' }) });
      const uid = String(f.get('card_uid') ?? '').trim();
      if (uid && uid.replace(/:/g, '').toUpperCase() !== editing.card_uid) await call(`/students/${editing.id}/card`, { method: 'PUT', body: JSON.stringify({ card_uid: uid }) });
      setEditing(null); await load(); show('Aluno guardado');
    } catch (err) { show(errText(err), 'bad'); }
    setBusy(false);
  }

  return (
    <section>
      <PageHeader
        title="Alunos e cartões"
        subtitle={students ? `${active.length} alunos ativos · ${withoutCard.length === 0 ? 'todos com cartão' : `${withoutCard.length} sem cartão`}` : 'A carregar'}
        action={<div className="flex gap-2"><button onClick={() => setImporting(true)} className="btn btn-ghost">Importar CSV</button><button onClick={() => setAdding(true)} className="btn btn-primary">Adicionar aluno</button></div>}
      />

      {unknown.length > 0 && (
        <div className="card anim-rise mb-6 border-brand/40 p-5">
          <div className="flex items-center gap-2"><span className="anim-blink h-2 w-2 rounded-full bg-brand" aria-hidden /><h2 className="font-display text-lg">Cartões por associar</h2></div>
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar aluno" aria-label="Procurar aluno" className="input max-w-xs" />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyNoCard} onChange={(e) => setOnlyNoCard(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /> Só sem cartão
        </label>
      </div>

      <div className="card overflow-hidden">
        {students === null ? <SkeletonRows /> : shown.length === 0 ? (
          <Empty title={students.length === 0 ? 'Ainda não há alunos' : 'Nenhum aluno encontrado'} hint={students.length === 0 ? 'Adicione o primeiro aluno e associe-lhe um cartão.' : 'Mude a pesquisa ou o filtro.'} />
        ) : (
          <ul>{shown.map((s, i) => (
            <li key={s.id} className="anim-rise flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-0 hover:bg-surface-2/60" style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}>
              <Avatar name={s.name} />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${s.active ? '' : 'text-muted line-through'}`}>{s.name}</p>
                <p className="text-xs text-muted">{classes.find((c) => c.id === s.class_id)?.name ?? 'Sem turma'}</p>
              </div>
              {s.card_uid ? <code className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs">{s.card_uid}</code>
                : s.active ? <span className="pill" style={{ ['--tone' as string]: 'var(--late)' }}>Sem cartão</span> : null}
              {!s.active && <span className="pill" style={{ ['--tone' as string]: 'var(--gone)' }}>Inativo</span>}
              <button onClick={() => setEditing(s)} className="btn btn-quiet px-2 text-sm">Editar</button>
            </li>))}</ul>
        )}
      </div>

      {adding && (
        <Modal title="Adicionar aluno" onClose={() => setAdding(false)}>
          <form onSubmit={add} className="flex flex-col gap-4">
            <Field label="Nome"><input name="name" required autoFocus className="input" /></Field>
            <Field label="Turma"><select name="class_id" className="input"><option value="">Sem turma</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="UID do cartão (opcional)" hint="Pode ficar vazio: o cartão aparece em “por associar” quando for lido no kiosk."><input name="card_uid" className="input font-mono" /></Field>
            <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Encarregado (opcional)</legend>
              <Field label="Nome"><input name="guardian_name" className="input" /></Field>
              <Field label="Email" hint="Cria a conta e liga ao aluno. Se o email já existir, liga só mais um educando."><input name="guardian_email" type="email" className="input" /></Field>
            </fieldset>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className="btn btn-ghost">Cancelar</button><Submit busy={busy} busyText="A adicionar">Adicionar aluno</Submit></div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal title="Editar aluno" subtitle={editing.name} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="flex flex-col gap-4">
            <Field label="Nome"><input name="name" required defaultValue={editing.name} className="input" /></Field>
            <Field label="Turma"><select name="class_id" defaultValue={editing.class_id ?? ''} className="input"><option value="">Sem turma</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="UID do cartão" hint="Trocar o UID passa o cartão antigo a desconhecido."><input name="card_uid" defaultValue={editing.card_uid ?? ''} className="input font-mono" /></Field>
            <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={!!editing.active} className="h-4 w-4 accent-[var(--brand)]" /> Aluno ativo (aparece no painel e pode usar o cartão)</label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="btn btn-ghost">Cancelar</button><Submit busy={busy} busyText="A guardar">Guardar aluno</Submit></div>
          </form>
        </Modal>
      )}
      {importing && <ImportModal call={call} onClose={() => setImporting(false)} onDone={() => void load()} />}
      {creds && (
        <Modal title="Encarregado criado" subtitle={creds.who} onClose={() => setCreds(null)}>
          <p className="text-sm text-muted">Conta: <span className="font-medium text-ink">{creds.email}</span></p>
          <Secret label="Senha temporária" value={creds.password} note="Mostrada só agora. Entregue-a ao encarregado; no primeiro acesso ele troca em Definições." />
          <button onClick={() => setCreds(null)} className="btn btn-primary">Feito</button>
        </Modal>
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
  const families = new Set(rows.map((r) => r.guardian_email?.toLowerCase()).filter(Boolean)).size;

  async function send() {
    setBusy(true); setFailed(false);
    try { setResult(await call<ImportResult>('/import/students', { method: 'POST', body: JSON.stringify({ rows }) })); onDone(); }
    catch { setFailed(true); }
    setBusy(false);
  }

  const template = () => download('modelo-alunos.csv', toCsv([['nome', 'turma', 'cartao', 'encarregado', 'email'], ['Joana Silva', '1.º A', '04A1B2C3D4E5F6', 'Maria Silva', 'maria@email.cv'], ['Miguel Fortes', '1.º A', '', 'Maria Silva', 'maria@email.cv']]));

  if (result) {
    return (
      <Modal title="Importação concluída" onClose={onClose}>
        <ul className="grid grid-cols-3 gap-3 text-center">
          {[['Alunos', result.students], ['Turmas novas', result.classes], ['Encarregados novos', result.guardians]].map(([l, n]) => (
            <li key={l as string} className="rounded-xl bg-surface-2 p-3"><p className="font-display text-3xl tabular-nums">{n}</p><p className="text-xs text-muted">{l}</p></li>
          ))}
        </ul>
        {result.credentials.length > 0 && (
          <div className="rounded-xl border border-brand/25 bg-brand-soft p-4">
            <p className="text-sm font-medium">As senhas temporárias só aparecem agora.</p>
            <p className="mt-1 text-xs text-muted">Descarregue a lista e entregue a cada encarregado. Eles trocam a senha no primeiro acesso.</p>
            <button onClick={() => download('senhas-encarregados.csv', toCsv([['Encarregado', 'Email', 'Senha temporária'], ...result.credentials.map((c) => [c.name, c.email, c.temporary_password])]))} className="btn btn-primary mt-3 text-sm">Descarregar senhas (CSV)</button>
          </div>
        )}
        {result.errors.length > 0 && (
          <div>
            <p className="text-sm font-medium text-bad">{result.errors.length} {result.errors.length === 1 ? 'linha não foi importada' : 'linhas não foram importadas'}</p>
            <ul className="mt-1 max-h-32 overflow-auto text-sm text-muted">{result.errors.map((e) => <li key={e.row}>Linha {e.row + 1}, {e.name}: {IMPORT_ERRORS[e.error] ?? e.error}</li>)}</ul>
          </div>
        )}
        <button onClick={onClose} className="btn btn-primary">Feito</button>
      </Modal>
    );
  }

  return (
    <Modal title="Importar alunos por CSV" subtitle="Alunos, turmas e encarregados de uma só vez." onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm text-muted">
        <p>Colunas: <span className="font-mono text-ink">nome</span> (obrigatória), <span className="font-mono text-ink">turma</span>, <span className="font-mono text-ink">cartao</span>, <span className="font-mono text-ink">encarregado</span>, <span className="font-mono text-ink">email</span>. As turmas que não existirem são criadas, e um email repetido liga vários filhos ao mesmo encarregado.</p>
        <button onClick={template} className="btn btn-quiet w-fit px-2 text-sm">Descarregar modelo</button>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Ficheiro
        <input type="file" accept=".csv,.txt,text/csv" className="input py-2" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Ou cole aqui
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="input resize-none font-mono text-xs" placeholder={'nome;turma;cartao;encarregado;email'} />
      </label>
      {parsed?.error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{parsed.error}</p>}
      {rows.length > 0 && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm"><span className="font-semibold">{rows.length}</span> {rows.length === 1 ? 'aluno' : 'alunos'}, <span className="font-semibold">{classes}</span> {classes === 1 ? 'turma' : 'turmas'}, <span className="font-semibold">{families}</span> {families === 1 ? 'encarregado' : 'encarregados'}.</p>
      )}
      {failed && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">Não foi possível importar. Verifique o ficheiro e tente de novo.</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
        <button onClick={send} disabled={busy || rows.length === 0} className="btn btn-primary">{busy ? <><Spinner /> A importar</> : `Importar ${rows.length || ''} ${rows.length === 1 ? 'aluno' : 'alunos'}`.trim()}</button>
      </div>
    </Modal>
  );
}
