import { utcToLocalHHMM } from './time.js';

export interface DayEvent { type: string; late: number | boolean; tapped_at: string }
export type DayStatus = 'present' | 'late' | 'absent' | 'left';

/** Resume o dia de um aluno a partir dos seus eventos (já filtrados para esse dia). */
export function daySummary(events: DayEvent[], tz: string) {
  const first = (type: string) => events.filter((e) => e.type === type).sort((a, b) => a.tapped_at.localeCompare(b.tapped_at))[0];
  const entry = first('entry'), lunch = first('lunch'), exit = first('exit');
  const status: DayStatus = exit ? 'left' : entry ? (entry.late ? 'late' : 'present') : 'absent';
  return {
    status,
    late: !!entry?.late,
    entry_time: utcToLocalHHMM(entry?.tapped_at ?? null, tz),
    lunch_time: utcToLocalHHMM(lunch?.tapped_at ?? null, tz),
    exit_time: utcToLocalHHMM(exit?.tapped_at ?? null, tz),
    incidents: events.filter((e) => e.type === 'incident').length,
  };
}
