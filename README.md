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

### Supabase Auth

O projeto Supabase usado por esta aplicação é `qrnlzyxfncfpmushhjnn`. Copie o arquivo de exemplo para `.env`:

```bash
cp .env.example .env
```

O Vite carrega automaticamente as variáveis `VITE_*` do `.env`. O script `npm run server` também carrega o mesmo arquivo; preencha a chave secreta e as credenciais do líder antes de iniciar:

```bash
export SUPABASE_URL=https://qrnlzyxfncfpmushhjnn.supabase.co
export SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
export SUPABASE_SECRET_KEY=sb_secret_...
```

`SUPABASE_SECRET_KEY` é opcional para validar sessões, mas é necessário para que o líder crie contas de voluntários pela API. Essa chave é exclusiva do backend: nunca a coloque no `.env.local`, no frontend ou em uma variável `VITE_*`.

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

Na primeira execução com Supabase Auth, o líder inicial é criado no Supabase Auth e vinculado ao perfil local quando as variáveis abaixo são informadas antes de iniciar a API:

```bash
AUTH_BOOTSTRAP_EMAIL=lider@igreja.org AUTH_BOOTSTRAP_PASSWORD='troque-esta-senha' npm run server
```

O líder poderá criar as contas dos voluntários pela API administrativa. O navegador mantém a sessão do Supabase e envia o access token em `Authorization: Bearer ...`; o Express valida o token com `supabase.auth.getUser()` antes de qualquer rota protegida. O role e o vínculo com o voluntário continuam sendo lidos do perfil local por e-mail verificado.

Se `SUPABASE_SECRET_KEY` não estiver configurada, crie primeiro o usuário na tela Authentication do Supabase e use o mesmo e-mail do líder bootstrap local.

Se o e-mail local já existir e a senha estiver incorreta no modo legado, pare a API e faça um reset explícito uma única vez:

```bash
AUTH_BOOTSTRAP_EMAIL=lider@igreja.org AUTH_BOOTSTRAP_PASSWORD='nova-senha-segura' AUTH_BOOTSTRAP_RESET=true npm run server
```

Depois, reinicie a API sem `AUTH_BOOTSTRAP_RESET=true`.

Com Supabase Auth configurado, alterações de senha devem ser feitas pelo Supabase Auth; `AUTH_BOOTSTRAP_RESET` não altera a senha de um usuário já existente no Supabase.

Quando o painel e a API estiverem em origens diferentes, configure as origens permitidas separadas por vírgula:

```bash
CORS_ORIGIN=https://painel.exemplo.org npm run server
```

O access token Supabase é enviado pelo frontend em uma requisição CORS; o servidor precisa responder com a origem permitida. O cookie legado continua disponível apenas quando Supabase Auth não está configurado.

## Produção com Render e Supabase

Em produção, o backend usa PostgreSQL quando `DATABASE_URL` está configurada. Sem essa variável, o ambiente local continua usando SQLite.

No Render, configure:

- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- `DATABASE_URL`: connection string do Supabase
- `VITE_SUPABASE_URL`: URL pública do projeto Supabase, usada no build do frontend
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publishable, usada no build do frontend
- `SUPABASE_URL`: URL do projeto para validação no backend
- `SUPABASE_PUBLISHABLE_KEY`: chave publishable usada pelo cliente Supabase do backend
- `SUPABASE_SECRET_KEY`: chave secret somente no backend; necessária para criar contas pela API
- `NODE_ENV=production`
- `AUTH_BOOTSTRAP_EMAIL`: e-mail inicial do líder
- `AUTH_BOOTSTRAP_PASSWORD`: senha inicial com pelo menos 8 caracteres

As variáveis `VITE_*` precisam estar configuradas antes do build do Render, pois o Vite as incorpora no bundle público. Nunca use `SUPABASE_SECRET_KEY` com o prefixo `VITE_`.

O Express serve o build do React e a API no mesmo domínio. Por isso, no cenário recomendado, `CORS_ORIGIN` e `COOKIE_CROSS_SITE` não precisam ser configurados. O frontend continua usando `/api` como base.

Para migrar o banco SQLite local para um projeto Supabase vazio, faça um backup antes e execute:

```bash
DATABASE_URL='postgresql://...' MIGRATION_REPLACE=true npm run migrate:postgres
```

O comando lê `server/db/database.sqlite` por padrão. Para indicar outro arquivo, use `SQLITE_PATH=/caminho/arquivo.sqlite`. `MIGRATION_REPLACE=true` apaga os dados das tabelas de destino antes da importação; use somente em um projeto novo ou após confirmar o backup.

O schema do PostgreSQL é criado automaticamente na primeira inicialização da API. Não execute `npm run seed` contra o Supabase de produção: ele limpa e recria os dados.

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
