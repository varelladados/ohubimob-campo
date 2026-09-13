// Service Worker do OHubImob Campo.
// Estratégia: cache-first com revalidação em segundo plano.
// O app inteiro (sql.js/WASM + lógica + UI) mora num único HTML, então a lista de
// assets é curta — o que dá offline real depois da primeira visita.
//
// IMPORTANTE ao publicar uma versão nova: incrementar CACHE ('...-v2', '-v3'...).
// Sem isso, quem já instalou continua preso na versão em cache pra sempre.
//
// ATUALIZAÇÃO AUTOMÁTICA: mudar o nome do cache sozinho não bastava. Como a estratégia
// é cache-first, o primeiro acesso depois de uma publicação ainda entrega a versão antiga
// enquanto a nova instala por trás — só na SEGUNDA abertura o usuário via o app novo.
// skipWaiting() + clients.claim() abaixo fazem a versão nova assumir o controle na hora,
// e a página escuta 'controllerchange' e se recarrega sozinha (ver o bloco "atualização
// automática" em app-local-campo.html).
//
// Isso resolve de v5 em diante. Mas quem está numa versão ANTERIOR tem uma página que não
// tem esse ouvinte: pra ela a troca de worker passa despercebida. Por isso o activate
// pergunta a cada aba aberta se ela sabe se atualizar sozinha; quem não responder é
// recarregado por fora (v6). Quem responder cuida do próprio reload — e só a página sabe
// esperar a gravação pendente terminar e não atropelar um formulário sendo preenchido.
const CACHE = 'ohubimob-campo-v7';  // v7: rodada 33 — lote A1 (visita, Hoje, toque e leitura, formulários) e navegação que ignora ?query

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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    await recarregarQuemNaoSabeSeAtualizar();
  })());
});

// Pergunta a cada aba aberta se ela tem o ouvinte de atualização. Quem responde 'pong'
// se recarrega sozinha, com os cuidados que só a página tem (esperar a gravação pendente,
// não recarregar por cima de um formulário aberto). Quem não responde é de uma versão
// anterior à v5 e não sabe fazer isso — essa é recarregada por fora, que é o único jeito
// de tirar alguém de uma versão que não tem o mecanismo.
async function recarregarQuemNaoSabeSeAtualizar() {
  const abas = await self.clients.matchAll({ type: 'window' });
  if (!abas.length) return;
  const responderam = new Set();
  const ouvir = evento => {
    if (evento.data && evento.data.tipo === 'ds2-pong' && evento.source) responderam.add(evento.source.id);
  };
  self.addEventListener('message', ouvir);
  abas.forEach(aba => aba.postMessage({ tipo: 'ds2-ping' }));
  // 2s: a página responde em milissegundos, e ela só se recarrega depois de ~400ms,
  // então dá tempo de sobra pro 'pong' chegar antes de qualquer decisão aqui.
  await new Promise(r => setTimeout(r, 2000));
  self.removeEventListener('message', ouvir);
  abas.forEach(aba => {
    if (responderam.has(aba.id)) return;
    if (typeof aba.navigate === 'function') aba.navigate(aba.url).catch(() => {});
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Só intercepta same-origin e as fontes do Google. Nunca intercepta wa.me/tel:,
  // que precisam sair pro sistema operacional de verdade.
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  // Navegação com ?query (atalhos do ícone, links com ?acao=) casa com o app em cache
  // ignorando a query — senão o endereço não bate e o app abre a página offline do
  // navegador. E guarda sob o endereço sem query: uma cópia só do app de 1 MB.
  const nav = req.mode === 'navigate';
  event.respondWith(
    caches.match(req, nav ? { ignoreSearch: true } : undefined).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(nav ? url.origin + url.pathname : req, copy));
        }
        return res;
      }).catch(() => cached);
      // cache-first: responde instantâneo (inclusive offline) e atualiza por trás
      return cached || network;
    })
  );
});
