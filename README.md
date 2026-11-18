# Manga

Uma ilha no topo do Windows: o **Manga**, um assistente com Claude e Gemini
(e o Claude Code na ilha), as notificações, os controles do Windows, o que
está tocando, foco e alarmes, o seu dia (clima, agenda, notas, tarefas, água)
e a sua mesa (apps, área de transferência, prateleira). O plano completo está
em [ROADMAP.md](ROADMAP.md).

## Instalar

Baixe o instalador (`Manga_x.y.z_x64-setup.exe`) da página
[Releases](https://github.com/adrianojsfelix/Manga/releases) e abra. Ele instala
só para o seu usuário, sem pedir administrador. Depois, o Manga avisa quando
sair uma versão nova (Configurações → Sobre).

## Rodar a partir do código

Precisa de [Rust](https://rustup.rs), [Node.js](https://nodejs.org) 18 ou mais
novo e do Visual Studio Build Tools com "Desenvolvimento para desktop com C++".

```powershell
npm install
npm run tauri dev
```

A ilha aparece no topo da tela. O ícone na bandeja tem "Sair do Manga".

Para gerar o instalador na sua máquina: `npx tauri build` (ele fica em
`target/release/bundle/nsis/`).

## Publicar uma versão

1. Suba a versão em `package.json`, `src-tauri/Cargo.toml` e
   `src-tauri/tauri.conf.json`.
2. Crie e envie a tag: `git tag v0.9.0` e `git push origin v0.9.0`.

O GitHub Actions (`.github/workflows/release.yml`) roda os testes, gera o
instalador no Windows e publica a versão em Releases.

## Testes

```powershell
npm test                      # a lógica da ilha (TypeScript)
cargo test -p manga-core      # a lógica do lado Rust
```

## Pastas

- `src/` — a ilha (TypeScript): `core/` estado, geometria, configurações e
  aparência; `island/` a tela; `mascot/` o Manga (desenhado em código);
  `assistant/`, `claude-code/`, `media/`, `focus/`, `controls/`, `day/`,
  `desk/`, `sysinfo/`, `tools/`, `notify/`, `settings/` cada parte.
- `src-tauri/` — o app (Rust, Tauri 2): as janelas e o que fala com o Windows.
- `crates/manga-core/` — a lógica do lado Rust que dá para testar em qualquer
  computador.
