/**
 * Gera o SQL dos dados de demonstração (APAGA tudo antes): 2 escolas, contas, 25 alunos e 14 dias de atividade.
 *   tsx scripts/seed.ts --out .seed.sql    senha "prezenti123" em todas as contas; só o utilizador muda
 * Depois: wrangler d1 execute prezenti --file .seed.sql [--local | --remote]
 */
import fs from 'node:fs';
import { hashPassword } from '../src/lib/password.js';

const args = process.argv.slice(2);
const out = args[args.indexOf('--out') + 1] ?? '.seed.sql';
const PASSWORD = 'prezenti123'; // igual em todas as contas de demonstração (o ecrã de login tem o acesso rápido)

const q = (v: unknown) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : `'${String(v).replace(/'/g, "''")}'`);
const sql: string[] = [];
const insert = (table: string, row: Record<string, unknown>) =>
  sql.push(`INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(q).join(', ')});`);
const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

const passwordHash = await hashPassword(PASSWORD);
const account = (row: { id: number; school_id: number | null; name: string; username: string; role: string }) =>
  insert('users', { ...row, password_hash: passwordHash });

for (const t of ['notification_log', 'consents', 'push_subscriptions', 'unknown_cards', 'events', 'devices', 'guardian_students', 'students', 'classes', 'users', 'schools', 'login_failures']) {
  sql.push(`DELETE FROM ${t};`);
}
sql.push('DELETE FROM sqlite_sequence;');

// Duas escolas para validar o isolamento entre elas.
account({ id: 1, school_id: null, name: 'Super Admin', username: 'super', role: 'super_admin' });
let userId = 2, classId = 1, studentId = 1;
const firstClass: Record<number, number> = {};
const firstStudent: Record<number, number> = {};
for (const [i, name] of ['Escola Piloto', 'Escola Demo B'].entries()) {
  const sid = i + 1;
  insert('schools', { id: sid, name, slug: i === 0 ? 'piloto' : 'demo-b' });
  account({ id: userId++, school_id: sid, name: `Gestor ${sid}`, username: `admin${sid}`, role: 'admin' });
  const teacher = userId++;
  account({ id: teacher, school_id: sid, name: `Prof. ${sid}`, username: `prof${sid}`, role: 'teacher' });
  firstClass[sid] = classId;
  insert('classes', { id: classId++, school_id: sid, name: '1.º A', teacher_id: teacher });
  firstStudent[sid] = studentId;
  insert('students', { id: studentId++, school_id: sid, class_id: firstClass[sid], name: `Aluno Teste ${sid}`, card_uid: `04A1B2C3D4E5${i}0` });
  const guardian = userId++;
  account({ id: guardian, school_id: sid, name: `Pai ${sid}`, username: `pai${sid}`, role: 'guardian' });
  insert('guardian_students', { guardian_id: guardian, student_id: firstStudent[sid] });
}

// Atividade fictícia dos últimos 14 dias na Escola Piloto, para ver os gráficos do painel.
// Cabo Verde é UTC-1 sem horário de verão, por isso hora local + 1 h = UTC.
const NAMES = [
  'Joana Silva', 'Miguel Fortes', 'Aline Monteiro', 'Kevin Lopes', 'Sara Tavares', 'Diogo Andrade',
  'Beatriz Gomes', 'Rui Barbosa', 'Núria Ramos', 'Tiago Pereira', 'Luana Cardoso', 'Hugo Évora',
  'Maya Semedo', 'Dário Furtado', 'Ivone Correia', 'Nelson Brito', 'Carla Neves', 'Pedro Vaz',
  'Yara Duarte', 'Samuel Lima', 'Inês Rocha', 'Flávio Mendes', 'Telma Spencer', 'Gil Santos',
];
let seedState = 42;
const rnd = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

const classIds = [firstClass[1]];
for (const name of ['2.º B', '3.º C']) { classIds.push(classId); insert('classes', { id: classId++, school_id: 1, name }); }
// Sem token válido: só serve de origem aos eventos de demonstração.
insert('devices', { id: 1, school_id: 1, name: 'Portaria', location: 'gate', token_hash: 'demo-sem-token' });

const students: number[] = [];
for (const [i, name] of NAMES.entries()) {
  students.push(studentId);
  insert('students', { id: studentId++, school_id: 1, class_id: classIds[i % 3], name, card_uid: `0400DE0000${String(i).padStart(4, '0')}` });
}

const pad = (n: number) => String(n).padStart(2, '0');
const now = Date.now();
for (let back = 13; back >= 0; back--) {
  const local = new Date(now - back * 864e5 - 3600e3);
  const dow = local.getUTCDay();
  if (dow === 0 || dow === 6) continue;
  const local_date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  const midnightUtc = Date.parse(`${local_date}T00:00:00Z`) + 3600e3; // 00:00 local em UTC
  const at = (minutes: number) => new Date(midnightUtc + minutes * 60e3);
  const rate = 0.84 + rnd() * 0.12;
  const push = (e: Record<string, unknown> & { tapped_at: Date }) => {
    // Nada no futuro: se o seed correr de madrugada, o dia de hoje fica vazio, como na vida real.
    if (e.tapped_at.getTime() <= now) insert('events', { school_id: 1, ...e, tapped_at: sqlTime(e.tapped_at), local_date });
  };
  for (const id of students) {
    if (rnd() > rate) continue;
    const arrive = Math.round(8 * 60 + 3 + gauss() * 15);
    push({ student_id: id, type: 'entry', device_id: 1, late: arrive > 8 * 60 + 15, tapped_at: at(arrive) });
    if (rnd() < 0.88) push({ student_id: id, type: 'lunch', device_id: 1, late: false, tapped_at: at(12 * 60 + 10 + Math.round(rnd() * 35)) });
    if (back > 0 || rnd() < 0.3) push({ student_id: id, type: 'exit', device_id: 1, late: false, tapped_at: at(15 * 60 + 40 + Math.round(rnd() * 50)) });
    if (rnd() < 0.025) push({ student_id: id, type: 'incident', late: false, note: 'health: dor de cabeça', tapped_at: at(10 * 60 + Math.round(rnd() * 120)) });
  }
}

fs.writeFileSync(out, sql.join('\n') + '\n');
console.log(`${sql.length} instruções em ${out}`);
