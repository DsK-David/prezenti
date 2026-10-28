import type { Knex } from 'knex';

// Atividade fictícia dos últimos 14 dias na Escola Piloto, para ver os gráficos do painel.
// Cabo Verde é UTC-1 sem horário de verão, por isso hora local + 1 h = UTC.
const NAMES = [
  'Joana Silva', 'Miguel Fortes', 'Aline Monteiro', 'Kevin Lopes', 'Sara Tavares', 'Diogo Andrade',
  'Beatriz Gomes', 'Rui Barbosa', 'Núria Ramos', 'Tiago Pereira', 'Luana Cardoso', 'Hugo Évora',
  'Maya Semedo', 'Dário Furtado', 'Ivone Correia', 'Nelson Brito', 'Carla Neves', 'Pedro Vaz',
  'Yara Duarte', 'Samuel Lima', 'Inês Rocha', 'Flávio Mendes', 'Telma Spencer', 'Gil Santos',
];
const CLASS_NAMES = ['2.º B', '3.º C'];

let seedState = 42;
const rnd = () => ((seedState = (seedState * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

export async function seed(knex: Knex): Promise<void> {
  const school = await knex('schools').where({ slug: 'piloto' }).first('id');
  if (!school) return;
  const sid = school.id;

  const classIds: number[] = [(await knex('classes').where({ school_id: sid }).first('id')).id];
  for (const name of CLASS_NAMES) {
    const [id] = await knex('classes').insert({ school_id: sid, name });
    classIds.push(id);
  }
  const device = await knex('devices').where({ school_id: sid }).first('id');
  const [gate] = device ? [device.id] : await knex('devices').insert({ school_id: sid, name: 'Portaria', location: 'gate', token_hash: 'demo-hash' });

  const students: number[] = [];
  for (const [i, name] of NAMES.entries()) {
    const [id] = await knex('students').insert({ school_id: sid, class_id: classIds[i % 3], name, card_uid: `0400DE0000${String(i).padStart(4, "0")}` });
    students.push(id);
  }

  const events: Record<string, unknown>[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = Date.now();
  for (let back = 13; back >= 0; back--) {
    const day = new Date(now - back * 864e5);
    const dow = new Date(day.getTime() - 3600e3).getUTCDay(); // dia da semana local
    if (dow === 0 || dow === 6) continue;
    const local_date = `${new Date(day.getTime() - 3600e3).getUTCFullYear()}-${pad(new Date(day.getTime() - 3600e3).getUTCMonth() + 1)}-${pad(new Date(day.getTime() - 3600e3).getUTCDate())}`;
    const midnightUtc = Date.parse(`${local_date}T00:00:00Z`) + 3600e3; // 00:00 local em UTC
    const at = (minutes: number) => new Date(midnightUtc + minutes * 60e3);
    const rate = 0.84 + rnd() * 0.12;

    for (const id of [...students, ...students.slice(0, 0)]) {
      if (rnd() > rate) continue;
      const arrive = Math.round(8 * 60 + 3 + gauss() * 15);
      const late = arrive > 8 * 60 + 15;
      events.push({ school_id: sid, student_id: id, type: 'entry', device_id: gate, late, tapped_at: at(arrive), local_date });
      if (rnd() < 0.88) events.push({ school_id: sid, student_id: id, type: 'lunch', device_id: gate, late: false, tapped_at: at(12 * 60 + 10 + Math.round(rnd() * 35)), local_date });
      if (back > 0 || rnd() < 0.3) events.push({ school_id: sid, student_id: id, type: 'exit', device_id: gate, late: false, tapped_at: at(15 * 60 + 40 + Math.round(rnd() * 50)), local_date });
      if (rnd() < 0.025) events.push({ school_id: sid, student_id: id, type: 'incident', late: false, note: 'health: dor de cabeça', tapped_at: at(10 * 60 + Math.round(rnd() * 120)), local_date });
    }
  }
  // Nada no futuro: se o seed correr de madrugada, o dia de hoje fica vazio, como na vida real.
  const past = events.filter((e) => (e.tapped_at as Date).getTime() <= now);
  for (let i = 0; i < past.length; i += 200) await knex('events').insert(past.slice(i, i + 200));
}
