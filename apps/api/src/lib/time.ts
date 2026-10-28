/** Data local (YYYY-MM-DD) e minutos desde a meia-noite no fuso da escola. */
export function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    hhmm: `${get('hour')}:${get('minute')}`,
  };
}

/** Converte "YYYY-MM-DD HH:MM:SS" (UTC, como vem da base) em HH:MM no fuso da escola. */
export function utcToLocalHHMM(utc: string | null, timeZone: string) {
  return utc ? localParts(new Date(utc.replace(' ', 'T') + 'Z'), timeZone).hhmm : null;
}

export function hhmmToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
