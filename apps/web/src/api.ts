import type {
  Coolant,
  OptimizationResult,
  TransferDesign,
  TransferResult,
  OpenSourceReference,
  PowerBalance,
  PowerParams,
  ReactorModel,
  ReactorParams,
  ReactorPreset,
  ScenarioParams,
  SimulationResult,
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
  coolants: () => request<Coolant[]>('/energy-transfer/coolants'),
  transfer: (input: { power: PowerParams; design: TransferDesign }, signal?: AbortSignal) =>
    request<TransferResult>('/energy-transfer', postJson(input, signal)),
  optimizeTransfer: (input: { power: PowerParams; design: TransferDesign }) =>
    request<OptimizationResult>('/energy-transfer/optimize', postJson(input)),
  simulate: (
    input: { power: PowerParams; plasmaVolume: number; scenario: ScenarioParams },
    signal?: AbortSignal,
  ) => request<SimulationResult>('/simulation', postJson(input, signal)),
};
