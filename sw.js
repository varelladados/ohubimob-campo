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
const CACHE = 'ohubimob-campo-v18';  // v18: agenda C4 — arrastar pra remarcar, primeiro uso, transição de tela, ações em lote, ficha em imagem, o que levar
// v17 anterior: agenda C3 — aviso com o app fechado (push por um serviço mínimo, camada 3)
// v16 anterior: agenda C2 (escrever como fala, horários livres, hora de sair, resumo de amanhã, repetição, Mês, mensagens prontas, tarefas)
// v15 anterior: agenda nova (compromissos, pessoas, favorito, visões, lembretes, .ics), imóvel com CEP e posição conferida, busca em tudo
// v14 anterior: design system DS 3 (visual Leve: tinta + rosa-ipê, Atkinson Hyperlegible Next), Perto como alternativa em Mais
// v13 anterior: Interações com humor e sinais; qualificação de lead e captação com motivos e o que falta saber
// v12 anterior: texto do canal do follow-up segue o botão (E-mail virava WhatsApp só no botão)
// v11 anterior: voltar e fechar a partir de uma ficha devolvem a ficha; remarcar depois do check-in e marcar outra visita depois de encerrada (teste no Xiaomi)
// v10 anterior:  // v10: rodada 34 — aviso de backup, exportar antes de apagar, PIN esquecido pede confirmação, apagar imóvel leva as visitas
const COMPARTILHADO = 'ohubimob-compartilhado';  // o que chegou pelo compartilhamento do Android, até o app ler

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png',
  './atalho-voz.png',
  './atalho-agora.png',
  './atalho-lead.png'
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
    await Promise.all(keys.filter(k => k !== CACHE && k !== COMPARTILHADO).map(k => caches.delete(k)));
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
  // Destino de compartilhamento (manifest "share_target"): o Android manda texto e fotos por
  // POST. Guarda num cache à parte e abre o app com ?acao=compartilhado, que lê e apaga.
  const alvo = new URL(req.url);
  if (req.method === 'POST' && alvo.origin === self.location.origin && alvo.searchParams.has('compartilhar')) {
    event.respondWith((async () => {
      try {
        const dados = await req.formData();
        const cache = await caches.open(COMPARTILHADO);
        await Promise.all((await cache.keys()).map(k => cache.delete(k)));
        const texto = [dados.get('title'), dados.get('text'), dados.get('url')].filter(Boolean).join('\n');
        await cache.put('/__compartilhado/texto', new Response(texto));
        const arquivos = dados.getAll('arquivos').filter(f => f && f.size);
        await cache.put('/__compartilhado/qtd', new Response(String(Math.min(arquivos.length, 5))));
        await Promise.all(arquivos.slice(0, 5).map((f, i) =>
          cache.put('/__compartilhado/arquivo-' + i, new Response(f, { headers: { 'content-type': f.type || 'image/jpeg' } }))));
      } catch (e) { /* abre o app mesmo assim */ }
      return Response.redirect(new URL(alvo.pathname + '?acao=compartilhado', alvo.origin).href, 303);
    })());
    return;
  }
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

// ---------- avisos com o app fechado (lote C3, rodada 36) ----------
// O serviço mínimo (push-servico/) guarda só o endereço de push e os MINUTOS com aviso — nunca
// texto. Ele manda um push VAZIO na hora; o texto (já pronto, sem telefone, montado pela página
// com antecedência) mora aqui no aparelho, neste IndexedDB, que a página também escreve.
const IDB_AVISOS = 'ohubimob-avisos';
function abrirIdbAvisosSw() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(IDB_AVISOS, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('avisos')) d.createObjectStore('avisos', { keyPath: 'chave' });
      if (!d.objectStoreNames.contains('mostrados')) d.createObjectStore('mostrados');
      if (!d.objectStoreNames.contains('estado')) d.createObjectStore('estado');
    };
    r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
  });
}
function idbPedidoSw(r) { return new Promise((ok, falha) => { r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); }); }
function idbFimSw(tx) { return new Promise((ok, falha) => { tx.oncomplete = () => ok(); tx.onerror = tx.onabort = () => falha(tx.error); }); }

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    const agora = Date.now();
    let avisos = [];
    try {
      const d = await abrirIdbAvisosSw();
      try { avisos = (await idbPedidoSw(d.transaction('avisos').objectStore('avisos').getAll())) || []; } finally { d.close(); }
    } catch (e) { /* sem IndexedDB legível, mostra o aviso genérico abaixo */ }
    // "vencido há mais de 15 min não ajuda" é a mesma régua da camada 1 (verificarLembretes)
    const devidos = avisos.filter(a => a.quando <= agora + 30000 && a.quando > agora - 15 * 60000).sort((a, b) => a.quando - b.quando).slice(0, 3);
    if (!devidos.length) {
      // o navegador exige que todo push mostre alguma notificação, mesmo sem nada vencido agora
      await self.registration.showNotification('OHubImob Campo', { body: 'Abra o app pra ver a agenda.', tag: 'lemb:geral', icon: 'icon-192.png', badge: 'icon-192.png' });
      return;
    }
    await Promise.all(devidos.map(a => self.registration.showNotification(a.titulo, { body: a.corpo || '', tag: a.tag || ('lemb:' + (a.dados && a.dados.item)),
      renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', data: a.dados, actions: a.acoes || [] })));
    try {
      const d = await abrirIdbAvisosSw();
      try {
        const tx = d.transaction(['avisos', 'mostrados'], 'readwrite'), s = tx.objectStore('avisos'), m = tx.objectStore('mostrados');
        devidos.forEach(a => { s.delete(a.chave); m.put(agora, a.chave); });
        await idbFimSw(tx);
      } finally { d.close(); }
    } catch (e) { /* na próxima sincronização a página resolve sozinha */ }
  })());
});

// "Adiar 10 min" tocado sem nenhuma aba aberta: sem servidor não haveria como reagendar (o que
// ficou registrado como limite do lote C1). Com o serviço, o worker reagenda direto — regrava o
// horário local (10 min à frente) e manda o novo horário pro serviço, sem precisar abrir o app.
async function adiarSemAba(dados) {
  const item = String((dados && dados.item) || ''); if (!item || item === 'resumo') return;
  const novoQuando = Date.now() + 10 * 60000;
  let avisos = [], cfgSw = null;
  try {
    const d = await abrirIdbAvisosSw();
    try {
      const tx = d.transaction(['avisos', 'estado']);
      [avisos, cfgSw] = await Promise.all([idbPedidoSw(tx.objectStore('avisos').getAll()), idbPedidoSw(tx.objectStore('estado').get('cfg'))]);
    } finally { d.close(); }
  } catch (e) { return; }
  const registro = { chave: 'adiado:' + (dados.chave || item) + ':' + Date.now(), quando: novoQuando, especial: null, titulo: 'Lembrete adiado', corpo: '',
    tag: 'lemb:' + item, dados: Object.assign({}, dados, { item }), acoes: [{ action: 'adiar', title: 'Adiar 10 min' }, { action: 'abrir', title: 'Abrir' }], origem: 'sw-adiado' };
  try {
    const d = await abrirIdbAvisosSw();
    try { const tx = d.transaction('avisos', 'readwrite'); tx.objectStore('avisos').put(registro); await idbFimSw(tx); } finally { d.close(); }
  } catch (e) { /* segue tentando avisar o serviço mesmo assim */ }
  if (cfgSw && cfgSw.url && cfgSw.id && cfgSw.segredo && cfgSw.endpoint) {
    try {
      const futuros = avisos.filter(a => a.quando > Date.now()).map(a => Math.floor(a.quando / 60000));
      const quandos = Array.from(new Set(futuros.concat(Math.floor(novoQuando / 60000))));
      await fetch(cfgSw.url.replace(/\/$/, '') + '/v1/inscricao/' + cfgSw.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segredo: cfgSw.segredo, endpoint: cfgSw.endpoint, quandos }) });
    } catch (e) { /* sem internet agora: o adiamento local fica guardado, a página resolve quando abrir */ }
  }
}

// Notificação "Visita em andamento" (lote B, B15). Tocar no corpo abre a visita; os botões
// abrem a nota de voz ou o encerramento — nada grava sem um toque dentro do app.
self.addEventListener('notificationclick', event => {
  // Lembrete da agenda (rodada 36): Adiar 10 min ou Abrir. Com o app aberto em alguma aba, ele
  // resolve; "Adiar" sem nenhuma aba é o próprio worker que reagenda (lote C3).
  const tag = event.notification.tag || '';
  if (tag.startsWith('lemb:')) {
    event.notification.close();
    const d = event.notification.data || {}, adiar = event.action === 'adiar', confirmar = event.action === 'confirmar', destinoL = d.url || './';
    event.waitUntil((async () => {
      const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const aba = abas.find(a => new URL(a.url).pathname === new URL(destinoL, self.location.origin).pathname) || abas[0];
      if (aba) { if (!adiar) await aba.focus(); aba.postMessage({ tipo: 'lembrete', acao: adiar ? 'adiar' : confirmar ? 'confirmar' : 'abrir', item: d.item, chave: d.chave }); return; }
      if (adiar) return adiarSemAba(d);
      await self.clients.openWindow(destinoL + '?acao=agenda-item&item=' + encodeURIComponent(d.item || '') + (confirmar ? '&confirmar=1' : ''));
    })());
    return;
  }
  const acao = event.action === 'voz' ? 'voz-visita' : event.action === 'encerrar' ? 'encerrar' : 'visita';
  const destino = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aba = abas.find(a => new URL(a.url).pathname === new URL(destino, self.location.origin).pathname) || abas[0];
    if (aba) {
      await aba.focus();
      aba.postMessage({ tipo: 'acao', acao });
    } else {
      await self.clients.openWindow(destino + '?acao=' + acao);
    }
  })());
});
