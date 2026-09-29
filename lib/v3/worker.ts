/// <reference lib="webworker" />
import { generateV3 } from './generate.ts';
self.onmessage = (event: MessageEvent<{ id: number; request: unknown; seed: string }>) => {
  const { id, request, seed } = event.data;
  try { const result = generateV3(request, seed, { progress: progress => self.postMessage({ id, type: 'PROGRESS', progress }) }); self.postMessage({ id, type: 'COMPLETE', result }); }
  catch (error) { self.postMessage({ id, type: 'ERROR', message: error instanceof Error ? error.message : 'Generation failed.' }); }
};
export {};
