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

Na primeira execução, crie o líder inicial informando as variáveis antes de iniciar a API:

```bash
AUTH_BOOTSTRAP_EMAIL=lider@igreja.org AUTH_BOOTSTRAP_PASSWORD='troque-esta-senha' npm run server
```

O líder poderá criar as contas dos voluntários pela API administrativa. As sessões usam cookie `HttpOnly` e as rotas administrativas exigem autenticação de líder.

Se o e-mail já existir e a senha estiver incorreta, pare a API e faça um reset explícito uma única vez:

```bash
AUTH_BOOTSTRAP_EMAIL=lider@igreja.org AUTH_BOOTSTRAP_PASSWORD='nova-senha-segura' AUTH_BOOTSTRAP_RESET=true npm run server
```

Depois, reinicie a API sem `AUTH_BOOTSTRAP_RESET=true`.

Quando o painel e a API estiverem em origens diferentes, configure as origens permitidas separadas por vírgula e habilite cookies cross-site somente se necessário:

```bash
CORS_ORIGIN=https://painel.exemplo.org COOKIE_CROSS_SITE=true npm run server
```

Nesse cenário, a API deve estar sob HTTPS para que o cookie `Secure` seja aceito pelo navegador.

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
