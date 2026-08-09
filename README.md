# Escala de Transmissão

Painel administrativo para cadastrar a equipe de transmissão, registrar indisponibilidades, gerar e revisar escalas mensais, publicar versões oficiais e exportá-las em PDF.

## Requisitos

- Node.js compatível com as versões declaradas no `package-lock.json`
- npm

## Instalação

```bash
npm ci
npm run seed
```

O seed é destinado ao ambiente de desenvolvimento. Os dados usados pelo painel são servidos pela API e persistidos no SQLite; dados mockados e `localStorage` não são fontes de verdade.

## Desenvolvimento

Em um terminal, inicie a API:

```bash
npm run server
```

Em outro terminal, inicie o painel:

```bash
npm run dev
```

O painel fica disponível em `http://localhost:3000` e encaminha chamadas `/api` para o servidor local.

## Verificação

```bash
npm test
npm run test:db
npm run build
```

O conjunto de testes cobre as regras do gerador e os fluxos públicos da API com banco temporário.

## Escopo

A Fase 1 cobre o painel do líder, persistência, geração e revisão da escala, publicação versionada e exportação. Autenticação, portal do voluntário e trocas pertencem à Fase 2.

Consulte [o plano de término da Fase 1](docs/phase-1-termination-plan.md) e os ADRs em `docs/adr/` para as regras de negócio.
