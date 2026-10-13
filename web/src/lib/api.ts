// Cliente HTTP. Toda mutación lleva el encabezado X-SOC-AI (defensa CSRF del servidor).

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function handle<T>(res: Response, url = ''): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let msg = `Error ${res.status}`;
  let code: string | undefined;
  try {
    const body = await res.json();
    msg = body.error ?? msg;
    code = body.code;
  } catch { /* respuesta sin JSON */ }
  // Sesión expirada en mitad del uso: la puerta de sesión vuelve a la pantalla de ingreso.
  if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('socai:unauthorized'));
  throw new ApiError(msg, res.status, code);
}

export function get<T>(url: string): Promise<T> {
  return fetch(`/api${url}`, { credentials: 'same-origin' }).then((r) => handle<T>(r, url));
}

export function send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<T> {
  return fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-SOC-AI': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => handle<T>(r, url));
}

export function upload<T>(url: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  return fetch(`/api${url}`, { method: 'POST', credentials: 'same-origin', headers: { 'X-SOC-AI': '1' }, body: fd }).then((r) => handle<T>(r, url));
}

/** POST que responde con server-sent events; llama onEvent por cada evento JSON. */
export async function stream(url: string, body: unknown, onEvent: (ev: any) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`/api${url}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-SOC-AI': '1', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) await handle(res, url);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}
