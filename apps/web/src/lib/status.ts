export type Status = 'present' | 'late' | 'absent' | 'left';

export const STATUS: Record<Status, { label: string; tone: string }> = {
  present: { label: 'Presente', tone: 'var(--ok)' },
  late: { label: 'Atrasado', tone: 'var(--late)' },
  absent: { label: 'Ausente', tone: 'var(--bad)' },
  left: { label: 'Já saiu', tone: 'var(--gone)' },
};

export interface TodayRow {
  id: number; name: string; class_name: string | null; status: Status; late: boolean;
  entry_time: string | null; lunch: boolean; lunch_time: string | null; exit_time: string | null;
}
