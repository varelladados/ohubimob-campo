// Service Worker do OHubImob Campo.
// Estratégia: cache-first com revalidação em segundo plano.
// O app inteiro (sql.js/WASM + lógica + UI) mora num único HTML, então a lista de
// assets é curta — o que dá offline real depois da primeira visita.
//
// IMPORTANTE ao publicar uma versão nova: incrementar CACHE ('...-v2', '-v3'...).
// Sem isso, quem já instalou continua preso na versão em cache pra sempre.
//
// ATUALIZAÇÃO AUTOMÁTICA (v5): mudar o nome do cache sozinho não bastava. Como a
// estratégia é cache-first, o primeiro acesso depois de uma publicação ainda entrega
// a versão antiga enquanto a nova instala por trás — só na SEGUNDA abertura o usuário
// via o app novo. skipWaiting() + clients.claim() abaixo fazem a versão nova assumir
// o controle na hora, e a página escuta 'controllerchange' e se recarrega sozinha
// (ver o bloco "atualização automática" em app-local-campo.html). O par é obrigatório:
// sem o lado da página, o controle troca mas o HTML já carregado continua sendo o velho.
const CACHE = 'ohubimob-campo-v5';  // v5: rodada 32 — mesma versão da v4, agora com atualização aplicada sozinha (ver bloco abaixo)

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll é atômico: se um asset falhar, nada é cacheado. Cacheia um a um pra
      // que uma falha isolada (ex. ícone renomeado) não derrube a instalação inteira.
      // cache:'reload' fura o cache HTTP do navegador: sem isso a instalação da versão
      // nova podia buscar o arquivo antigo que o GitHub Pages ainda tinha no cache do
      // navegador e recachear a versão velha com nome de versão nova.
      .then(cache => Promise.all(ASSETS.map(url =>
        cache.add(new Request(url, { cache: 'reload' }))
          .catch(() => cache.add(url).catch(() => null))   // navegador sem suporte a cache:'reload'
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Só intercepta same-origin e as fontes do Google. Nunca intercepta wa.me/tel:,
  // que precisam sair pro sistema operacional de verdade.
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      // cache-first: responde instantâneo (inclusive offline) e atualiza por trás
      return cached || network;
    })
  );
});
