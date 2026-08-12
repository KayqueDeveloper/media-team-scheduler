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

`SUPABASE_PUBLISHABLE_KEY` é usada pelo backend para validar tokens do Supabase. `SUPABASE_SECRET_KEY` é necessária apenas para provisionar contas pela API ou pelo bootstrap. Essa chave é exclusiva do backend: nunca a coloque no `.env.local`, no frontend ou em uma variável `VITE_*`.

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

Na primeira execução, o perfil local do líder é criado quando as variáveis abaixo são informadas antes de iniciar a API:

```bash
AUTH_BOOTSTRAP_EMAIL=lider@igreja.org AUTH_BOOTSTRAP_NAME='Líder' npm run server
```

O usuário correspondente deve existir no Supabase Auth. Para provisioná-lo automaticamente na primeira execução, informe também `AUTH_BOOTSTRAP_PASSWORD` e mantenha `SUPABASE_SECRET_KEY` configurada. Essa senha é enviada somente ao Supabase Auth e nunca é armazenada no banco local.

O navegador mantém a sessão do Supabase e envia o access token em `Authorization: Bearer ...`; o Express valida o token com `supabase.auth.getUser()` antes de qualquer rota protegida. O role e o vínculo com o voluntário continuam sendo lidos do perfil local por e-mail verificado.

Alterações e resets de senha devem ser feitos pelo Supabase Auth.

### Cadastro público de voluntários

A tela de login oferece a opção **Ainda não tenho cadastro**, também acessível diretamente em `/cadastro`. O formulário exige nome, e-mail, telefone brasileiro com DDD e senha de pelo menos 8 caracteres.

Mantenha **Confirm email** habilitado nas configurações do Supabase Auth. Adicione as URLs públicas `/cadastro?confirmado=1` e `/redefinir-senha` à lista de Redirect URLs. Por padrão, o backend envia o voluntário para `/cadastro?confirmado=1`; quando frontend e API usam domínios diferentes, configure a URL completa:

```bash
AUTH_EMAIL_REDIRECT_TO=https://painel.exemplo.org/cadastro?confirmado=1
```

O fluxo é:

1. o Supabase cria a identidade e envia o e-mail de confirmação;
2. a API cria um voluntário inativo e uma conta com aprovação pendente;
3. depois da confirmação, o cadastro aparece na fila **Cadastros** do painel do líder;
4. a aprovação ativa a conta e o voluntário, inicialmente sem proficiências (N0);
5. a rejeição exclui definitivamente a identidade do Supabase e os registros locais.

O backend precisa de `SUPABASE_SECRET_KEY` para verificar identidades e executar rejeições. Essa chave nunca é enviada ao navegador. E-mails já existentes são bloqueados; a própria tela oferece acesso ao login e à recuperação de senha.

Quando o painel e a API estiverem em origens diferentes, configure as origens permitidas separadas por vírgula:

```bash
CORS_ORIGIN=https://painel.exemplo.org npm run server
```

O access token Supabase é enviado pelo frontend em uma requisição CORS; o servidor precisa responder com a origem permitida.

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
- `SUPABASE_SECRET_KEY`: chave secret somente no backend; necessária para provisionar contas pela API ou pelo bootstrap
- `NODE_ENV=production`
- `AUTH_BOOTSTRAP_EMAIL`: e-mail inicial do líder
- `AUTH_BOOTSTRAP_NAME`: nome opcional do perfil inicial
- `AUTH_BOOTSTRAP_PASSWORD`: opcional; senha para provisionar o usuário inicial no Supabase Auth
- `AUTH_EMAIL_REDIRECT_TO`: opcional; URL completa para onde o Supabase redireciona após confirmar um novo cadastro
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASS`: acesso SMTP; para Gmail, use `smtp.gmail.com`, porta `465` e uma senha de app
- `EMAIL_FROM`: nome e endereço exibidos como remetente; com Gmail, deve usar a mesma conta de `SMTP_USER`
- `RESEND_API_KEY`: alternativa opcional ao SMTP, exigindo remetente de domínio verificado
- `PUBLIC_APP_URL`: origem pública do painel, usada nos links enviados por e-mail
- `APP_TIME_ZONE`: fuso do calendário dos lembretes; padrão `America/Sao_Paulo`
- `CONFIRMATION_TOKEN_SECRET`: segredo longo e aleatório usado para assinar os links públicos (obrigatório em produção)

As variáveis `VITE_*` precisam estar configuradas antes do build do Render, pois o Vite as incorpora no bundle público. Nunca use `SUPABASE_SECRET_KEY` com o prefixo `VITE_`.

O Express serve o build do React e a API no mesmo domínio. Por isso, no cenário recomendado, `CORS_ORIGIN` não precisa ser configurado. O frontend continua usando `/api` como base.

Para migrar o banco SQLite local para um projeto Supabase vazio, faça um backup antes e execute:

```bash
DATABASE_URL='postgresql://...' MIGRATION_REPLACE=true npm run migrate:postgres
```

O comando lê `server/db/database.sqlite` por padrão. Para indicar outro arquivo, use `SQLITE_PATH=/caminho/arquivo.sqlite`. `MIGRATION_REPLACE=true` apaga os dados das tabelas de destino antes da importação; use somente em um projeto novo ou após confirmar o backup.

O schema do PostgreSQL é criado automaticamente na primeira inicialização da API. Não execute `npm run seed` contra o Supabase de produção: ele limpa e recria os dados.

### Confirmações e lembretes diários

Cada voluntário escalado, de manhã ou à noite, começa a receber e-mails três dias antes do culto. O lembrete é repetido uma vez por dia até ele confirmar a presença ou abrir uma solicitação de troca. A confirmação não pede motivo; a troca exige motivo e a escolha de outra pessoa já escalada, com dia/turno compatível. Enquanto a troca aguarda aceite, o destinatário também recebe um lembrete diário.

Configure um **Cron Job diário** no Render, compartilhando as mesmas variáveis e o mesmo `DATABASE_URL` do serviço web:

```bash
npm run reminders:send
```

O comando é idempotente por item e data. Falhas de envio não marcam o lembrete como concluído, permitindo nova tentativa na próxima execução; o painel do líder exibe a última falha registrada.

## Verificação

```bash
npm test
npm run test:db
npm run test:e2e
npm run build
```

O conjunto de testes cobre as regras do gerador, os fluxos públicos da API com banco temporário e a confirmação/troca no Chromium via Playwright.

## Escopo

A Fase 1 cobre o painel do líder, persistência, geração e revisão da escala, publicação versionada e exportação. A Fase 2 cobre autenticação, portal do voluntário, confirmações por e-mail e trocas bilaterais.

Consulte [o plano de término da Fase 1](docs/phase-1-termination-plan.md) e os ADRs em `docs/adr/` para as regras de negócio.
