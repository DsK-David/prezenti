import { db } from '../db.js';
import { hhmmToMinutes, localParts } from './time.js';
import { notifyGuardians } from './push.js';

const DEBOUNCE_MS = 2 * 60 * 1000;

export type TapResult =
  | { status: 'ok'; type: 'entry' | 'lunch' | 'exit'; student: { id: number; name: string; photo_url: string | null }; late: boolean }
  | { status: 'duplicate'; reason: 'debounce' | 'already_entered' | 'already_exited' | 'already_lunched' | 'replayed'; student?: { id: number; name: string; photo_url: string | null } }
  | { status: 'unknown_card' };

export interface Device {
  id: number;
  school_id: number;
  location: 'gate' | 'canteen';
}

/**
 * Regras do toque:
 *  - cantina => almoço
 *  - portaria => 1.º toque do dia é entrada; saída só depois de min_exit_time
 *  - mesmo aluno em menos de 2 min => ignorado
 *  - mesmo client_id reenviado (fila offline) => ignorado
 */
export async function processTap(
  device: Device,
  cardUid: string,
  tappedAt: Date,
  clientId?: string,
): Promise<TapResult> {
  const school = await db('schools').where({ id: device.school_id }).first();
  const student = await db('students')
    .where({ school_id: device.school_id, card_uid: cardUid, active: true })
    .first('id', 'name', 'photo_url');

  if (!student) {
    await db('unknown_cards').insert({
      school_id: device.school_id, card_uid: cardUid, device_id: device.id,
    });
    return { status: 'unknown_card' };
  }

  if (clientId) {
    const seen = await db('events').where({ device_id: device.id, client_id: clientId }).first('id');
    if (seen) return { status: 'duplicate', reason: 'replayed', student };
  }

  const local = localParts(tappedAt, school.timezone);
  const today = await db('events')
    .where({ student_id: student.id, local_date: local.date })
    .whereIn('type', ['entry', 'lunch', 'exit'])
    .orderBy('tapped_at', 'desc');

  const last = today[0];
  // Só é duplicado se estiver DENTRO da janela (também para toques antigos que chegam da fila offline).
  if (last && Math.abs(tappedAt.getTime() - new Date(last.tapped_at + 'Z').getTime()) < DEBOUNCE_MS) {
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

  const [eventId] = await db('events').insert({
    school_id: device.school_id,
    student_id: student.id,
    type,
    device_id: device.id,
    late,
    tapped_at: tappedAt,
    local_date: local.date,
    client_id: clientId ?? null,
  });

  const first = student.name.split(' ')[0];
  const body = {
    entry: `${first} chegou à escola às ${local.hhmm}.`,
    lunch: `${first} almoçou na cantina às ${local.hhmm}.`,
    exit: `${first} saiu da escola às ${local.hhmm}.`,
  }[type];
  // Não bloqueia a resposta ao kiosk.
  void notifyGuardians(eventId, student.id, { title: 'Prezenti', body, url: '/pais' });

  return { status: 'ok', type, student, late };
}
