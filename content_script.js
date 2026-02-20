/**
 * content_script.js
 *
 * Roda dentro de cada aba do Facebook (declarado no manifest.json).
 * Faz proxy de requisições fetch vindas do background script,
 * resolvendo o problema do origin: chrome-extension:// ser bloqueado.
 *
 * Como funciona:
 *   1. background.js chama chrome.tabs.sendMessage({ type: "proxyFetch", ... })
 *   2. Este listener recebe, faz o fetch com origin: https://www.facebook.com
 *   3. Devolve o texto da resposta via sendResponse
 *
 * Declarar no manifest.json:
 *   "content_scripts": [{
 *     "matches": ["https://www.facebook.com/*"],
 *     "js": ["content_script.js"],
 *     "run_at": "document_idle"
 *   }]
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "proxyFetch") return;

  const { url, headers, body } = message;

  fetch(url, {
    method:      "POST",
    headers:     headers,
    body:        body,
    credentials: "include",   // envia cookies do Facebook automaticamente
  })
    .then(response => response.text())
    .then(text => sendResponse({ ok: true, text }))
    .catch(err  => sendResponse({ ok: false, error: err.message }));

  // Retorna true para manter o canal aberto até sendResponse ser chamado
  return true;
});

console.log("[content_script] proxyFetch listener registrado");
