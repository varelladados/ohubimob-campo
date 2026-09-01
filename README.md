# OHubImob Campo

App de campo do corretor de imóveis — leads, agenda, portfólio, arquivos e WhatsApp, funcionando **offline**, num arquivo só.

👉 **[Abrir o app](https://varelladados.github.io/ohubimob-campo/)**

## O que é

Uma PWA instalável: abre no navegador do celular e pode ser adicionada à tela inicial, virando um app com ícone próprio, tela cheia e funcionamento offline. Não precisa de servidor, conta ou instalação de loja — o banco de dados (SQLite via sql.js) roda inteiro dentro do navegador, no próprio aparelho.

## Instalar no celular

- **Android (Chrome):** abra o link, vá em **Mais** e toque em "Adicionar à tela inicial"
- **iPhone (Safari):** abra o link, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**

Depois de instalado, funciona sem internet.

## O que funciona de verdade

- Cadastro de leads (venda e captação), imóveis, clientes e visitas — tudo persistido localmente
- Central "Hoje" e Agenda calculadas ao vivo sobre o banco
- Ligar e abrir WhatsApp direto de qualquer contato
- Notas por **voz** (transcrição real), texto ou **câmera**
- Arquivos: fotografa documentos, vincula a cliente/imóvel/lead e compartilha
- Calculadoras: financiamento, comissão e CMA (comparando com o próprio portfólio)
- Exportar/importar o banco (`.sqlite`) pra levar os dados de um aparelho a outro

## Dados são fictícios

Imóveis, clientes, leads e telefones que vêm carregados são **inventados**, só pra dar o que ver na primeira abertura. Use **Mais › Recomeçar do zero** pra limpar e cadastrar os seus.

## Limitações desta versão

- Os dados ficam **só neste aparelho** — não há conta, login nem sincronização entre celulares (pra mover, use exportar/importar)
- O texto extraído por OCR das fotos é **simulado** — a foto é real, a leitura automática ainda não
- Geração de conteúdo por IA não está incluída
- A transcrição por voz depende do navegador (funciona no Chrome; exige HTTPS e permissão de microfone)
