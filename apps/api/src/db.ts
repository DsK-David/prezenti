/** Pequenos atalhos sobre o D1: SQL direto, parâmetros posicionais (?). */

export type DB = D1Database;
type Param = string | number | null | boolean;

// O D1 não aceita undefined nem booleanos: passam a null e 0/1.
const clean = (ps: unknown[]) => ps.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p)) as Param[];

export async function all<T = Record<string, any>>(db: DB, sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...clean(params)).all<T>()).results;
}

export async function first<T = Record<string, any>>(db: DB, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...clean(params)).first<T>()) ?? null;
}

export async function run(db: DB, sql: string, ...params: unknown[]) {
  return db.prepare(sql).bind(...clean(params)).run();
}

/** INSERT e devolve o id criado. */
export async function insert(db: DB, sql: string, ...params: unknown[]): Promise<number> {
  return Number((await run(db, sql, ...params)).meta.last_row_id);
}

export const stmt = (db: DB, sql: string, ...params: unknown[]) => db.prepare(sql).bind(...clean(params));

/** "?, ?, ?" para listas em IN (...). */
export const marks = (n: number) => Array.from({ length: n }, () => '?').join(', ');

export const isDup = (e: unknown) => /UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e));

/** Date → "YYYY-MM-DD HH:MM:SS" em UTC, o formato de datetime('now') do SQLite. */
export const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
