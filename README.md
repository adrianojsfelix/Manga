# Manga

Uma ilha no topo do Windows com o **Kumo**, um assistente com Claude e Gemini,
os controles do Windows, o que está tocando, foco e alarmes e o seu dia de
relance. O plano completo está em [ROADMAP.md](ROADMAP.md).

## Rodar

Precisa de [Rust](https://rustup.rs), [Node.js](https://nodejs.org) e do
Visual Studio Build Tools com "Desenvolvimento para desktop com C++".

```powershell
npm install
npm run tauri dev
```

A ilha aparece no topo da tela. O ícone do Kumo na bandeja tem "Sair do Manga".

## Testes

```powershell
npm test                      # a lógica da ilha (TypeScript)
cargo test -p manga-core      # a lógica do lado Rust
```

## Pastas

- `src/` — a ilha (TypeScript): `core/` estado e geometria, `island/` a
  tela, `mascot/` o Kumo, `items/` os itens da barra.
- `src-tauri/` — o app (Rust, Tauri 2): a janela, a bandeja e, nas próximas
  fases, o que fala com o Windows.
- `crates/manga-core/` — a lógica do lado Rust que dá para testar em qualquer computador.
