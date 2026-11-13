import type {
  OpenSourceReference,
  PowerBalance,
  PowerParams,
  ReactorModel,
  ReactorParams,
  ReactorPreset,
} from './types';

const postJson = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal,
});

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(' · ') : body?.message;
    throw new Error(message ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  presets: () => request<ReactorPreset[]>('/reactors/presets'),
  references: () => request<OpenSourceReference[]>('/references'),
  build: (params: ReactorParams, signal?: AbortSignal) =>
    request<ReactorModel>('/reactors/build', postJson(params, signal)),
  powerBalance: (params: PowerParams, signal?: AbortSignal) =>
    request<PowerBalance>('/power-balance', postJson(params, signal)),
};
