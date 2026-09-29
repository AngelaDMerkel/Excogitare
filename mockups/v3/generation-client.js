/* A fresh worker per job makes cancellation immediate and prevents stale results. */
(() => {
  let active = null, serial = 0;
  function cancel() {
    if (!active) return;
    const job = active; active = null; job.worker.terminate(); clearTimeout(job.timeout);
    job.reject(new DOMException('Generation cancelled.', 'AbortError'));
  }
  function generate(request, onProgress) {
    if (active) throw new Error('A generation is already running.');
    const id = ++serial, seed = request.mode === 'ADVANCED' && request.options?.seed ? request.options.seed : crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const url = new URL('generation-worker.js', document.baseURI);
      url.searchParams.set('build', window.V3_GENERATOR_BUILD || '1');
      const worker = new Worker(url, { type: 'module' });
      const finish = (error, result) => { if (active?.id !== id) return; clearTimeout(active.timeout); active = null; worker.terminate(); if (error) reject(error); else resolve(result); };
      const timeout = setTimeout(() => finish(new Error('Generation took too long. Try a smaller map or lower effort.')), 120000);
      active = { id, worker, reject, timeout };
      worker.onmessage = ({ data }) => { if (active?.id !== id || data.id !== id) return; if (data.type === 'PROGRESS') onProgress?.(data.progress); else if (data.type === 'COMPLETE') finish(null, data.result); else if (data.type === 'ERROR') finish(new Error(data.message)); };
      worker.onerror = event => finish(new Error(event.message || 'The generation worker could not start. Rebuild the V3 bundle and reload.'));
      worker.onmessageerror = () => finish(new Error('The generated map could not be transferred.'));
      worker.postMessage({ id, request, seed });
    });
  }
  window.V3Generator = { generate, cancel };
})();
