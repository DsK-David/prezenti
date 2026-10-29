// Por defeito a API passa pelo próprio Next (/api → API_INTERNAL_URL, ver next.config.ts).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `http_${res.status}`);
  return res.json();
}
