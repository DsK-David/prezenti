import { all, first, insert, run, sqlTime } from '../db.js';
import type { Bindings, Device } from '../env.js';
import { hhmmToMinutes, localParts } from './time.js';
import { notifyGuardians } from './push.js';

const DEBOUNCE_MS = 2 * 60 * 1000;

type Student = { id: number; name: string; photo_url: string | null };
export type TapResult =
  | { status: 'ok'; type: 'entry' | 'lunch' | 'exit'; student: Student; late: boolean }
  | { status: 'duplicate'; reason: 'debounce' | 'already_entered' | 'already_exited' | 'already_lunched' | 'replayed'; student?: Student }
  | { status: 'unknown_card' };

/**
 * Regras do toque:
 *  - cantina => almoço
 *  - portaria => 1.º toque do dia é entrada; saída só depois de min_exit_time
 *  - mesmo aluno em menos de 2 min => ignorado
 *  - mesmo client_id reenviado (fila offline) => ignorado
 * `later` corre o aviso às famílias depois da resposta ao kiosk (waitUntil).
 */
export async function processTap(env: Bindings, device: Device, cardUid: string, tappedAt: Date, clientId: string | undefined, later: (p: Promise<unknown>) => void): Promise<TapResult> {
  const db = env.DB;
  const school = await first<{ timezone: string; late_after: string; min_exit_time: string }>(db, 'SELECT timezone, late_after, min_exit_time FROM schools WHERE id = ?', device.school_id);
  const student = await first<Student>(db, 'SELECT id, name, photo_url FROM students WHERE school_id = ? AND card_uid = ? AND active = 1', device.school_id, cardUid);

  if (!school || !student) {
    await run(db, 'INSERT INTO unknown_cards (school_id, card_uid, device_id) VALUES (?, ?, ?)', device.school_id, cardUid, device.id);
    return { status: 'unknown_card' };
  }

  if (clientId && await first(db, 'SELECT id FROM events WHERE device_id = ? AND client_id = ?', device.id, clientId)) {
    return { status: 'duplicate', reason: 'replayed', student };
  }

  const local = localParts(tappedAt, school.timezone);
  const today = await all<{ type: string; tapped_at: string }>(db,
    `SELECT type, tapped_at FROM events WHERE student_id = ? AND local_date = ? AND type IN ('entry', 'lunch', 'exit') ORDER BY tapped_at DESC`,
    student.id, local.date);

  const last = today[0];
  // Só é duplicado se estiver DENTRO da janela (também para toques antigos que chegam da fila offline).
  if (last && Math.abs(tappedAt.getTime() - new Date(last.tapped_at.replace(' ', 'T') + 'Z').getTime()) < DEBOUNCE_MS) {
    return { status: 'duplicate', reason: 'debounce', student };
  }

  let type: 'entry' | 'lunch' | 'exit';
  let late = false;
  if (device.location === 'canteen') {
    // O almoço conta uma vez por dia; mais toques não avisam a família de novo.
    if (today.some((e) => e.type === 'lunch')) return { status: 'duplicate', reason: 'already_lunched', student };
    type = 'lunch';
  } else {
    const hasEntry = today.some((e) => e.type === 'entry');
    const hasExit = today.some((e) => e.type === 'exit');
    if (!hasEntry) {
      type = 'entry';
      late = local.minutes > hhmmToMinutes(school.late_after);
    } else if (hasExit) {
      return { status: 'duplicate', reason: 'already_exited', student };
    } else if (local.minutes < hhmmToMinutes(school.min_exit_time)) {
      return { status: 'duplicate', reason: 'already_entered', student };
    } else {
      type = 'exit';
    }
  }

  const eventId = await insert(db,
    'INSERT INTO events (school_id, student_id, type, device_id, late, tapped_at, local_date, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    device.school_id, student.id, type, device.id, late, sqlTime(tappedAt), local.date, clientId ?? null);

  const name = student.name.split(' ')[0];
  const body = {
    entry: `${name} chegou à escola às ${local.hhmm}.`,
    lunch: `${name} almoçou na cantina às ${local.hhmm}.`,
    exit: `${name} saiu da escola às ${local.hhmm}.`,
  }[type];
  // Não bloqueia a resposta ao kiosk.
  later(notifyGuardians(env, eventId, student.id, { title: 'Prezenti', body, url: '/pais' }).catch(() => {}));

  return { status: 'ok', type, student, late };
}
