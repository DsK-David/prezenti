/** CSV simples (aspas, ; , ou tab) lido no navegador. Nada sai do computador até o gestor confirmar. */
export function parseCsv(input: string): string[][] {
  const t = input.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const delim = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const push = () => { row.push(cell); cell = ''; };
  const endRow = () => { push(); if (row.some((x) => x.trim())) rows.push(row); row = []; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) push();
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; endRow(); }
    else cell += c;
  }
  endRow();
  return rows;
}

export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\n');
}

export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportRow { name: string; class?: string; card_uid?: string; guardian_name?: string; guardian_email?: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ALIASES: Record<keyof ImportRow, string[]> = {
  name: ['nome', 'aluno', 'name'],
  class: ['turma', 'classe', 'class'],
  card_uid: ['cartao', 'card', 'uid', 'cartao nfc'],
  guardian_name: ['encarregado', 'responsavel', 'pai', 'mae', 'guardian'],
  guardian_email: ['email', 'e-mail', 'email encarregado', 'email do encarregado'],
};

/** Mapeia as colunas pelo cabeçalho (ordem livre, acentos e maiúsculas à parte). */
export function toImportRows(table: string[][]): { rows: ImportRow[]; error?: string } {
  if (table.length < 2) return { rows: [], error: 'O ficheiro precisa de um cabeçalho e pelo menos um aluno.' };
  const head = table[0].map(norm);
  const idx = (Object.keys(ALIASES) as (keyof ImportRow)[]).reduce((m, k) => ({ ...m, [k]: head.findIndex((h) => ALIASES[k].includes(h)) }), {} as Record<keyof ImportRow, number>);
  if (idx.name < 0) return { rows: [], error: 'Falta a coluna "nome" no cabeçalho.' };
  const get = (r: string[], k: keyof ImportRow) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
  const rows = table.slice(1).map((r) => {
    const out: ImportRow = { name: get(r, 'name') };
    (['class', 'card_uid', 'guardian_name', 'guardian_email'] as const).forEach((k) => { const v = get(r, k); if (v) out[k] = v; });
    return out;
  }).filter((r) => r.name);
  return { rows };
}
