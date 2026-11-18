# Manga — plano

Uma ilha no topo do Windows: o **Kumo** como assistente (Claude e Gemini), os
controles do Windows, o que está tocando, foco e alarmes, e o dia de relance.
Inspirado no mod "Ilha e Dock estilo Mac" do Windhawk (só as ideias: o código
dele é GPL e roda dentro do Explorer; o Manga é um app à parte, escrito do zero).

Cada fase termina com o app funcionando, testado e checado contra o Windows.

## Fase 1 — A base ✅
- Visual de **notch do MacBook** por padrão: colado no topo, cantos de baixo
  arredondados e as "orelhas" curvando para a borda da tela (ou, se preferir,
  a **pílula flutuante** da Dynamic Island do iPhone). Escala 80%–140%.
- Três tamanhos: **pequena** (só os olhos brilhantes do Kumo), **média**
  (cabeçalho: data à esquerda, olhos no meio, hora à direita, e os itens) e
  **estendida** (cabeçalho, a página e a barra de páginas embaixo; a página
  Início com os cartões Kumo, Tocando e Foco).
- O Kumo: bolinha com olhos de anime e a ahoge, 13 humores com as marcas de
  mangá; no notch, só os olhos, que piscam, seguem o mouse e mudam com o humor.
- Itens: relógio e data. Ícone na bandeja para sair.

## Fase 2 — O assistente e os avisos
- ✅ **Chat com o Kumo**: Claude e Gemini (chave de API ou a sua assinatura, pelo
  Claude Code e pelo Gemini CLI). O Kumo reage ao que acontece na conversa.
- ✅ **Claude Code**: as sessões do terminal na ilha, pedidos de permissão
  (Permitir / Negar) e as perguntas do Claude respondidas por ela.
- ✅ **Notificações do Windows**: caem da ilha e ficam numa lista (lidas do banco
  de notificações do Windows); apps ignorados; contador na barra.
- ✅ Página de **configurações** (assistente, notificações, ilha). Item: bateria.

## Fase 3 — Mídia e central de controle
- ✅ **O que está tocando**, de qualquer app: capa ou miniatura do vídeo, título,
  linha do tempo (clique para pular), anterior / tocar / próxima; a cor da capa
  tinge a ilha aberta.
- ✅ **Ondas sonoras** na ilha enquanto toca, no ritmo do som de verdade.
- ✅ **Picture-in-picture** de qualquer app: uma janela sempre por cima com a
  imagem ao vivo da janela onde o vídeo toca (a miniatura do próprio Windows),
  com os botões e a escolha de outra janela.
- ✅ **Central de controle**: volume e mudo, volume de cada app, brilho (tela do
  notebook), Wi-Fi, Bluetooth, Não perturbe (da ilha), microfone.
- Depois: saída de áudio, monitores externos (DDC/CI), modo avião, atalhos
  (luz noturna, projetar, energia), recortar só o vídeo no picture-in-picture.

## Fase 4 — Foco, timer e alarmes (seção especial)
- ✅ **Pomodoro** com tempos e rodadas configuráveis, **timer** (atalhos e ±1
  min), **cronômetro** e **alarmes** (horário, dias da semana, nome, soneca).
- ✅ **Tela de descanso** nas pausas: a tela inteira escurece, o Kumo descansa,
  dicas (olhar longe, alongar, beber água) e o botão de pular (se permitido).
- ✅ **Música lofi** gerada na hora (lofi beats, chuva, ruído marrom) e **links do
  YouTube** salvos (vídeos e playlists); pode tocar só durante o foco.
- ✅ **Toques de alarme** originais à escolha (sino suave, kalimba, digital,
  gotas, sinos de vento, pio do Kumo) e volume próprio.
- ✅ **Janela do alarme personalizável** (centro, topo ou na própria ilha; cor,
  mensagem, tocar até dispensar) com a **reação do Kumo** à escolha.
- ✅ **Contador na ilha** do que estiver correndo (na pequena e no topo).
- Depois: arquivos de som seus como toque, adiar a pausa.

## Extras pedidos depois da fase 4 ✅
- Ilha pequena com o relógio (ou dia e hora, ou os olhos do Manga) e um item
  de cada lado; personalização da pequena, da média/barras e das abas do dock.
- Modos **barra** e **barra larga**, com os ícones das ferramentas.
- O mascote se chama **Manga** e aparece no Início.
- Vídeo **ao vivo** no player (miniatura do Windows da janela que toca).
- Central de controle **editável**: modo avião, modo escuro, modo de energia,
  bloquear, suspender, reiniciar, desligar, lixeira, área de trabalho,
  captura, apps e páginas do Windows; **brilho de cada tela** (DDC/CI).
- Aba **Sistema**: CPU, memória, GPU, VRAM, download, upload, disco.
- Aba **Utilitários**: calculadora, cotações (dólar, euro, bitcoin…),
  notícias (RSS) e pastas do Pinterest.

## Fase 5 — O dia
- ✅ Página **Hoje**: clima com os próximos dias, agenda da semana, tarefas e
  a água do dia.
- ✅ **Clima** pelo Open-Meteo (grátis, sem conta), cidade escolhida por nome.
- ✅ **Agendas .ics** (Google Agenda, Outlook…), com eventos que se repetem.
- ✅ **Notas** e **tarefas** com data (atrasadas em vermelho).
- ✅ **Beber água** com meta, tamanho do copo, intervalo e horário dos
  lembretes, e o Manga lembrando.
- ✅ Itens da barra: clima, próximo evento, água.
- Depois: relógio de outras cidades, previsão por hora, lembrete de tarefas.

## Fase 6 — O Windows na ilha
- ✅ **Lixeira**: quantos itens e o tamanho, abrir, esvaziar; item na barra.
- ✅ **Teclado e idioma**: os layouts instalados, trocar pela ilha (ou pelo
  item da barra), aviso quando muda; Caps / Num / Scroll Lock (antes).
- ✅ **Apps da barra de tarefas**: as janelas abertas (alternar, minimizar,
  fechar) e os fixados (abrir); item com os ícones dos abertos na barra.
- ✅ **Área de transferência**: histórico só na memória (nunca salvo), sem o
  que os gerenciadores de senha marcam como privado; textos e imagens;
  clique para copiar de novo.
- ✅ **Prateleira**: arraste arquivos para a ilha; abrir, mostrar na pasta,
  copiar (para colar em qualquer pasta).
- ✅ Energia: bloquear, suspender, reiniciar, desligar (na central, fase extra).

## Fase 7 — Personalização robusta
- **Escolher e ordenar os itens** da ilha arrastando, por tamanho.
- Cores (preto, grafite, claro, cor do Windows, gradiente, a sua), **vidro**,
  borda brilhante, opacidade, cantos, tamanho, posição.
- Esconder em tela cheia; uma ilha em cada monitor; perfis.

## Fase 8 — Instalador e atualizações
- Instalador para Windows e aviso de versão nova pelo GitHub.

## O que não dá para um app separado fazer
- **Ícones da bandeja dos outros apps**: só quem roda dentro do Explorer (como
  o mod) consegue. A ilha pode abrir a bandeja do Windows.
- **Responder notificações** pelos botões delas: o Windows só entrega isso a
  apps da Microsoft Store.
