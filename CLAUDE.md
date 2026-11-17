# Manga — guia para agentes de código

Manga é uma ilha no topo do Windows (Tauri 2: Rust em `src-tauri/`,
TypeScript em `src/`). O mascote é o **Kumo**, desenhado em código
(`src/mascot/kumo.ts`). O plano por fases está em `ROADMAP.md`.

## Regras
- Projeto escrito do zero. Não copiar código, nome, desenhos nem sons do
  Coucou/Mochi, nem código do mod "Mac Island & Dock" do Windhawk (GPL-3.0):
  dele, só ideias.
- A interface fala português do Brasil (`src/core/i18n.ts`), com inglês de reserva.
- Lógica pura e testada: TypeScript em `tests/*.test.ts` (`npm test`), Rust em
  `crates/manga-core` (`cargo test -p manga-core`). O que fala com o Windows
  fica em `src-tauri`.
- Toda mudança em Rust passa por `cargo check --target x86_64-pc-windows-msvc`
  em `src-tauri`. Evitar dependências que compilam C (ring, rustls, SQLite
  embutido): para TLS use native-tls (schannel no Windows); para SQLite, o
  `winsqlite3` do próprio Windows.
- Nada de telemetria. Chaves de API no Gerenciador de Credenciais do Windows,
  nunca em arquivo nem no git.
- A janela da ilha nunca é maior que a ilha e sua sombra
  (`src/core/geometry.ts`), para o resto da tela continuar clicável.
