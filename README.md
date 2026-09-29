# Panelizer

Motor de painelização de paredes para light wood frame. Ver `docs/00-visao.md`.

## Setup (uma vez)
```bash
pnpm init               # se ainda não houver package.json na raiz (pnpm 10 não aceita -y)
mkdir -p packages/core/src/rules packages/core/src/panelize packages/core/src/output packages/core/src/data packages/core/test/rules
cd packages/core
pnpm init
pnpm add -D typescript vitest
npx tsc --init --strict --target ES2022 --module ESNext --moduleResolution bundler --outDir dist
```

Adicione em `packages/core/package.json`:
```json
"scripts": { "test": "vitest run", "test:watch": "vitest", "typecheck": "tsc --noEmit" }
```

Crie `pnpm-workspace.yaml` na raiz:
```yaml
packages:
  - packages/*
```

Na raiz, `package.json` delega para os pacotes:
```json
"scripts": { "test": "pnpm -r test", "typecheck": "pnpm -r typecheck" }
```

Pendências com a fábrica (painéis reais, altura de header, cantos…) em `docs/05-pendencias.md`.

## Começar a trabalhar
```bash
claude
```
Primeiro prompt: ver `docs/03-sessoes.md`, sessão 1.
