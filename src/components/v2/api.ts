export async function v2<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json() as { error?: string; message?: string };
      message = body.error || body.message || message;
    } catch {
      // keep status text
    }
    throw new Error(message);
  }
  return await response.json() as T;
}

export function subscribeRun(runId: string, onEvent: (event: string, data: any) => void): () => void {
  const source = new EventSource(`/v2/runs/${encodeURIComponent(runId)}/events`);
  const handler = (name: string) => (ev: MessageEvent) => {
    try {
      onEvent(name, JSON.parse(ev.data));
    } catch {
      onEvent(name, ev.data);
    }
  };
  source.addEventListener("progress", handler("progress"));
  source.addEventListener("state", handler("state"));
  source.addEventListener("done", handler("done"));
  source.addEventListener("error", handler("error"));
  return () => source.close();
}
