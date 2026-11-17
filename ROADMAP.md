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
- **Chat com o Kumo**: Claude e Gemini (chave de API ou a sua assinatura, pelo
  Claude Code e pelo Gemini CLI). O Kumo reage ao que acontece na conversa.
- **Claude Code**: as sessões do terminal na ilha, pedidos de permissão
  (Permitir / Negar) e as perguntas do Claude respondidas por ela.
- **Notificações do Windows**: caem da ilha e ficam numa lista (lidas do banco
  de notificações do Windows); apps ignorados; contador por app no sino.
- Janela de **configurações**. Item: bateria.

## Fase 3 — Mídia e central de controle
- **O que está tocando**, de qualquer app: capa ou miniatura do vídeo, título,
  linha do tempo, anterior / tocar / próxima, o volume do app.
- **Ondas sonoras** na ilha enquanto toca.
- **Picture-in-picture**: atalho que pede ao navegador a janela flutuante do
  vídeo (a extensão do Chrome) e uma janela flutuante própria para links do YouTube.
- **Central de controle**: volume e saída de áudio, volume de cada app,
  brilho (tela do notebook e monitores com DDC/CI), Wi-Fi, Bluetooth, Não
  incomodar, microfone, modo avião, e atalhos (luz noturna, projetar, energia).

## Fase 4 — Foco, timer e alarmes (seção especial)
- **Pomodoro** com tempos e rodadas configuráveis, **timer**, **cronômetro** e
  **alarmes** (horário, dias da semana, nome).
- **Janelas de descanso**: na pausa, uma janela pede para levantar, alongar,
  beber água (pode adiar ou pular).
- **Música lofi** embutida e **links do YouTube** salvos para tocar ali.
- **Toques de alarme** à escolha (e arquivos seus); volume próprio.
- **Janela de notificação do alarme personalizável** (cor, tamanho, posição,
  texto) com a **reação do Kumo**.
- **Contador na ilha** do que estiver correndo (Pomodoro, timer ou alarme).

## Fase 5 — O dia
- Página **Hoje**: notificações, o que toca, próximo evento, tarefas, água.
- **Relógio** (e outras cidades), **clima** (agora, próximas horas, semana),
  **calendário** (eventos e agendas .ics, como o Google Agenda),
  **notas**, **tarefas** com lembrete, **beber água** com meta e lembretes.

## Fase 6 — O Windows na ilha
- **Lixeira** (quantos itens, abrir, esvaziar).
- **Teclado e idioma** (trocar o layout; aviso de Caps Lock / Num Lock).
- **Programas da barra de tarefas**: os abertos e os fixados, para alternar
  e abrir pela ilha.
- Energia: bloquear, suspender, reiniciar, desligar. Prateleira de arquivos
  e área de transferência.

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
