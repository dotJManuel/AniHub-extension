// Helper de mensajería para las páginas de UI.
export function send(cmd, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ cmd, ...payload }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp) return reject(new Error('Sin respuesta del service worker.'));
      if (!resp.ok) return reject(new Error(resp.error || 'Error'));
      resolve(resp.data);
    });
  });
}
