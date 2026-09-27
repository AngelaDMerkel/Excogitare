/// <reference lib="webworker" />
import { runJob } from "../../lib/studio/operations.ts";
import type { Job } from "../../lib/studio/model.ts";
self.onmessage = (event: MessageEvent<{ id: number; job: Job }>) => {
  const { id, job } = event.data;
  try {
    const world = runJob(job, (label, completed, total) => self.postMessage({ id, kind: "PROGRESS", label, completed, total }));
    self.postMessage({ id, kind: "COMPLETE", world });
  } catch (error) { self.postMessage({ id, kind: "ERROR", message: error instanceof Error ? error.message : "The operation failed." }); }
};
export {};
