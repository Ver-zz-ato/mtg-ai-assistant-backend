export function apiUrl(path: string) {
  // In dev we’ll call the proxy prefix; in prod we’ll call the real backend URL
  const isDev = process.env.NODE_ENV !== "production";
  const prefix = isDev
    ? process.env.NEXT_PUBLIC_DEV_API_PREFIX ?? "/_api"
    : process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

  // Ensure single slash between base and path
  return `${prefix}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function fetchJson<T>(
  path: string,
  options: RequestInit & { body?: any } = {}
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
  }
  return (await res.json()) as T;
}

export async function fetchForm<T>(
  path: string,
  form: FormData,
  options: RequestInit = {}
): Promise<T> {
  // Do NOT set content-type; browser will add the boundary
  const res = await fetch(apiUrl(path), { method: "POST", body: form, ...options });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
  }
  return (await res.json()) as T;
}
