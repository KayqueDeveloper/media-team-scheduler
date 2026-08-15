# Plano de migração para TypeScript e Clean Architecture

## Status

Em execução desde 2026-08-12. Em 2026-08-13, todo o código-fonte, testes e configurações executáveis foram convertidos de `.js/.jsx/.mjs/.cjs` para `.ts/.tsx`, e `allowJs` foi removido dos tsconfigs. A fundação TypeScript, os contratos, o domínio compartilhado de escala, a política de indisponibilidade, a composição dos apps e a linha de base das migrações já foram implementados. Os módulos legados convertidos permanecem temporariamente atrás de fronteiras tipadas e com `@ts-nocheck`; a próxima fase elimina essas marcações por fatias sem alterar os contratos de negócio definidos nos ADRs 0001 a 0013.

## Objetivo

Migrar gradualmente o frontend React e o backend Node.js para TypeScript estrito, reorganizando o sistema como um monólito modular com Clean Architecture. A migração deve:

- preservar o comportamento e os dados existentes;
- manter o backend como autoridade para autorização e regras de negócio;
- tornar as regras de escala reutilizáveis e testáveis sem React, Express ou banco;
- reduzir o acoplamento entre domínio, HTTP, Supabase, SMTP e persistência;
- permitir entregas pequenas, reversíveis e verificáveis;
- remover o JavaScript legado somente depois da paridade funcional.

Não fazem parte deste plano uma troca de React, uma divisão em microserviços, uma reformulação visual ou uma mudança das regras dos ADRs.

## Diagnóstico do estado atual

No início da migração, o projeto tinha aproximadamente 10.671 linhas em arquivos JavaScript/JSX. Os maiores pontos de concentração eram:

- `server/index.js`: 1.135 linhas e 50 rotas; mistura composição, middleware, validação, autorização, casos de uso e mapeamento HTTP;
- `server/db/repository.js`: 783 linhas e 49 funções exportadas; mistura consultas de diversos contextos e regras transacionais;
- `src/App.jsx`: 644 linhas; mistura roteamento, autenticação, carregamento remoto, comandos e estado de várias telas;
- `src/api/client.js`: 539 linhas; mistura transporte, autenticação, compatibilidade legada e normalização de DTOs;
- `server/db/index.js`: 543 linhas; cria schema em runtime e mantém implementações paralelas para SQLite e PostgreSQL;
- regras de escala aparecem em `server/solver/scheduler.js`, `server/index.js` e `src/utils/scheduleUtils.js`.

No baseline, o build passava, mas o bundle principal minificado tinha cerca de 1,43 MB e disparava o alerta de chunk maior que 500 kB. A aparente falha agregada de `npm test` foi identificada como restrição de bind do ambiente isolado, não como flakiness da aplicação; executada com permissão de rede local, a suíte passa. Após o primeiro corte, o app inicial foi separado em chunks e o exportador PDF passou a ser carregado sob demanda.

Pontos positivos a preservar:

- os ADRs e o vocabulário em `CONTEXT.md` descrevem bem o domínio;
- o algoritmo de geração já tem boa cobertura de regras;
- fluxos críticos da API têm testes de integração;
- transações já protegem publicação, troca e confirmação;
- Supabase Auth, PostgreSQL e SQLite já estão atrás de implementações identificáveis.

## Decisões arquiteturais

| Tema | Decisão |
| --- | --- |
| Runtime do backend | Node.js 24 LTS, fixado em `.nvmrc`/`.node-version` e `engines`. Não usar Node 26 Current em produção. |
| Linguagem | TypeScript 6.0 e ESM. `allowJs` está desativado; código novo e módulos já migrados usam modo estrito, enquanto módulos legados convertidos removem `@ts-nocheck` por fatias. |
| Servidor HTTP | Manter Express 5 como adapter de entrada. Trocar de framework não melhora as regras nem justifica o risco desta migração. |
| Organização | npm workspaces com `apps/web`, `apps/api` e pacotes compartilhados pequenos. |
| Persistência | PostgreSQL/Supabase como banco de produção. Adotar migrações versionadas; parar de criar/alterar schema no startup. SQLite fica temporariamente como origem legada e é removido após o cutover. |
| Acesso a dados | Preferir Drizzle + `pg` em um adapter PostgreSQL, sujeito a um spike curto de compatibilidade. Repositórios não vazam tipos do driver para domínio/aplicação. |
| Contratos HTTP | Schemas de runtime com Zod e tipos inferidos em `packages/contracts`; DTOs de transporte não são entidades de domínio. |
| Estado remoto no frontend | TanStack Query para cache, invalidação e estados de requisição. Estado de formulário/tela permanece local. Não introduzir store global sem necessidade demonstrada. |
| Testes | Testes puros do domínio, integração através da interface de cada módulo, componentes com Testing Library e jornadas com Playwright. |
| Injeção | Composition root com factories explícitas. Não usar decorators nem container de injeção. |

Node recomenda versões LTS para produção. Em agosto de 2026, a linha 24 é LTS e a 26 ainda é Current. O Vite apenas transpila TypeScript, portanto `tsc --noEmit` será um gate separado do build.

## Arquitetura-alvo

```text
media-team-scheduler/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── app/                 # config, composição, servidor e lifecycle
│   │       ├── modules/
│   │       │   ├── access/
│   │       │   ├── volunteers/
│   │       │   ├── availability/
│   │       │   ├── scheduling/
│   │       │   ├── exchanges/
│   │       │   ├── confirmations/
│   │       │   └── notifications/
│   │       └── infrastructure/      # banco, logging e integrações comuns
│   └── web/
│       └── src/
│           ├── app/                 # router, providers e composition root
│           ├── modules/
│           │   ├── access/
│           │   ├── volunteers/
│           │   ├── availability/
│           │   ├── scheduling/
│           │   ├── exchanges/
│           │   └── confirmations/
│           └── ui/                  # design primitives e estilos compartilhados
├── packages/
│   ├── contracts/                   # DTOs, schemas e envelope de erro HTTP
│   ├── scheduling-domain/           # regras puras compartilháveis da escala
│   └── tooling/                     # tsconfig e regras comuns
└── docs/
```

Cada módulo de backend pode conter `domain`, `application` e `adapters`, mas essas pastas só devem existir quando houver código real. A dependência aponta sempre para dentro:

```text
HTTP / Postgres / Supabase / SMTP
              ↓
         application
              ↓
            domain
```

No frontend:

```text
React UI → application → domain
    ↓            ↓
router       ports de saída ← HTTP / Supabase adapters
```

### Regra de profundidade

Clean Architecture não significa criar uma interface, classe e arquivo para cada operação CRUD. Cada módulo deve expor uma interface pequena que concentre comportamento relevante. O teste principal atravessa a mesma interface usada pelo chamador.

Criar ports somente em seams que variam de verdade:

- `IdentityProvider`: Supabase em produção e fake controlado nos testes;
- `EmailGateway`: SMTP em produção e adapter de captura nos testes;
- `Clock`: relógio do sistema e relógio fixo nos testes;
- `ConfirmationToken`: HMAC em produção e implementação determinística nos testes;
- contrato HTTP: browser real e transporte falso/Mock Service Worker nos testes.

O PostgreSQL será testado com uma substituição local compatível, preferencialmente PGlite depois do spike. Isso permite testar o módulo completo sem publicar uma interface de repositório para cada tabela.

## Responsabilidade dos módulos

### Backend

- `access`: resolve identidade Supabase, perfil local, aprovação, roles e cadastro;
- `volunteers`: cadastro, ativação/inativação e proficiências;
- `availability`: registro, edição, remoção e data de corte;
- `scheduling`: geração, validação, edição, publicação, reabertura, versões e cobertura;
- `exchanges`: candidatura, solicitação bilateral, aceite/rejeição/cancelamento e aplicação atômica;
- `confirmations`: links assinados, confirmação e despacho idempotente de lembretes;
- `notifications`: caixa de notificações e marcação de leitura.

`scheduling-domain` será um módulo profundo e puro, com uma interface próxima de:

```ts
generateSchedule(input): GenerationResult
validateSchedule(input): ValidationResult
summarizeCoverage(input): CoverageSummary
```

Ele esconderá pontuação, elegibilidade, mentorias, limites, conflitos e warnings. O backend sempre executará novamente a validação antes de persistir ou publicar. O frontend poderá usá-lo apenas para feedback imediato durante a edição.

### Frontend

Cada módulo conterá somente o necessário:

- `domain`: tipos e transformações de apresentação independentes de React;
- `application`: comandos/queries do usuário e ports usados por eles;
- `adapters`: cliente HTTP, sessão Supabase e mapeadores;
- `ui`: páginas, componentes e hooks que chamam a aplicação.

`App.jsx` será reduzido ao roteamento e à composição. Componentes não chamarão o singleton `api` diretamente e não conhecerão nomes de coluna SQL. Dados remotos permanecerão em formato de DTO somente no adapter; a aplicação receberá modelos já validados.

## Contratos e erros

O pacote `contracts` define, por recurso:

- parâmetros de rota e query;
- body de entrada;
- resposta de sucesso;
- envelope uniforme de erro: `code`, `message`, `details` e `requestId`;
- enums de transporte e formatos de data/ID.

Toda entrada externa começa como `unknown` e é validada no adapter. O domínio reforça invariantes que continuam válidos fora do HTTP. Não usar `as`, non-null assertions ou conversões implícitas para contornar dados inválidos.

Compatibilidade é mantida no servidor durante a migração. Fallbacks legados do cliente, como os endpoints alternativos de proficiência e status, só são removidos depois que métricas/testes confirmarem que não há consumidor antigo.

## Persistência e Supabase

1. Capturar o schema atual e criar uma linha de base versionada de migrações.
2. Executar migrações por comando de deploy, nunca no boot da API.
3. Aplicar o padrão expandir → migrar dados → trocar leitura/escrita → contrair para alterações incompatíveis.
4. Manter IDs, constraints e histórico das versões publicadas.
5. Ensaiar backup, restauração e migração SQLite → PostgreSQL antes do cutover.
6. Rodar advisors e revisar índices/queries antes de cada alteração de schema.

O frontend usa Supabase somente para Auth. Portanto, as tabelas da aplicação não precisam ser expostas na Data API. A opção preferida é desabilitar a Data API para esses objetos ou mantê-los em schema não exposto, com grants mínimos. Se algum objeto for exposto, ele precisa de grants explícitos e RLS; `TO authenticated` sozinho não é autorização por linha.

Para o backend persistente no Render, usar conexão direta quando IPv6 estiver disponível; caso contrário, Supavisor em modo session. Transaction pooler fica reservado a runtimes efêmeros. Remover `rejectUnauthorized: false` como padrão de produção e validar TLS com a configuração/certificado apropriado.

Supabase secret/service role nunca entra no bundle do Vite. Roles de autorização ficam em dados controlados pela aplicação ou `app_metadata`, nunca em `user_metadata`. A API continua validando tokens com `auth.getUser(token)` e resolve o perfil local antes do caso de uso.

## Padrões de TypeScript e qualidade

Configuração base:

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noImplicitOverride` e `verbatimModuleSyntax`;
- `moduleResolution: Bundler` no frontend e `NodeNext` no backend;
- `isolatedModules` no frontend e project references para `tsc -b`;
- imports de tipo explícitos e exports públicos controlados por módulo;
- unions discriminadas para estados e erros esperados;
- objetos imutáveis/readonly nas interfaces de domínio;
- `Result` para falhas de negócio esperadas; exceções ficam para falhas inesperadas de infraestrutura;
- datas civis como `YYYY-MM-DD` validado e instantes como ISO UTC; timezone é dependência explícita;
- configuração de ambiente validada uma vez no startup, não lida por módulos via `process.env`.

Qualidade automatizada:

- ESLint em flat config com regras `typescript-eslint` type-checked;
- Prettier apenas para formatação;
- regra de dependências com `dependency-cruiser` ou equivalente;
- `lint`, `typecheck`, `test`, `test:integration`, `test:e2e` e `build` como scripts separados;
- lockfile versionado e dependências com versões controladas.

## Segurança e operação

Antes do cutover:

- aplicar `helmet`, CORS por allowlist e rate limit nos endpoints públicos de cadastro/confirmação;
- centralizar autenticação/autorização por grupo de rotas;
- manter limite de body e redigir tokens, senhas e chaves dos logs;
- adicionar `requestId`, logging JSON estruturado e mapeamento central de erros;
- separar health de processo (`/health/live`) e prontidão de banco/configuração (`/health/ready`);
- tratar encerramento gracioso de HTTP, pool e jobs;
- versionar ou rotacionar tokens de confirmação e documentar sua validade;
- auditar queries e payloads para impedir exposição de e-mail/telefone no portal do voluntário.

## Estratégia de testes

### Pirâmide

1. Testes puros de regras em `scheduling-domain` e value objects.
2. Testes da interface de cada módulo com banco local substituto e adapters fake para Supabase/SMTP/Clock.
3. Testes de contrato HTTP cobrindo status, schema, autorização e erros.
4. Testes de componentes orientados ao comportamento do usuário.
5. Playwright apenas para jornadas críticas entre frontend e API.

Os testes novos devem observar resultados, não detalhes internos. Quando uma interface nova cobrir o mesmo comportamento, os testes de módulos rasos antigos serão substituídos, evitando duas suítes permanentes para a mesma regra.

Casos obrigatórios antes de remover o legado:

- todas as regras dos ADRs 0001–0013;
- mês com quatro e cinco domingos, cobertura parcial e slots travados;
- publicação versionada e reabertura;
- cadastro, confirmação de e-mail, aprovação e rejeição compensada;
- isolamento entre líder e voluntário;
- data de corte de indisponibilidade no timezone configurado;
- troca bilateral concorrente e transação atômica;
- idempotência/retry dos lembretes;
- expiração/cancelamento de confirmação e troca;
- migração e restauração de uma cópia do banco.

## Sequência de entrega

Cada etapa termina com deploy possível e não mistura reorganização estrutural com mudança de regra.

### Etapa 0 — Baseline e ADRs

- confirmar a causa da falha aparente da suíte agregada e executar a suíte completa sem flakiness;
- congelar respostas atuais com testes de caracterização e snapshots de contrato selecionados;
- registrar ADRs para runtime, layout modular, contratos e persistência;
- criar orçamento de bundle e capturar tempos de build/teste;
- documentar inventário de dados e procedimento de rollback.

Gate: `test`, `test:db`, `test:e2e` e `build` verdes no Node 24 LTS.

### Etapa 1 — Fundação TypeScript

- introduzir workspaces e mover os apps sem alterar comportamento;
- adicionar TypeScript, tsconfigs, ESLint, Prettier e checagem de dependências;
- começar com `allowJs`, `checkJs` e erros novos bloqueando CI;
- validar env e criar composition roots explícitos;
- converter primeiro arquivos pequenos de catálogo/configuração.

Gate: JavaScript e TypeScript coexistem; todo `.ts/.tsx` novo passa em modo estrito.

### Etapa 2 — Contratos HTTP

- criar `packages/contracts` e o envelope de erro;
- tipar um recurso vertical completo, começando por voluntários;
- validar entrada e saída no adapter HTTP;
- substituir normalizações permissivas do cliente por parse explícito;
- manter endpoints e payloads compatíveis.

Gate: testes de contrato provam que cliente antigo e cliente tipado recebem comportamento equivalente.

### Etapa 3 — Domínio de escala

- portar o solver e seus testes para `scheduling-domain`;
- consolidar validação manual, geração e warnings no mesmo módulo profundo;
- modelar IDs, `LocalDate`, turno, função, proficiência, alocação e versão;
- usar o módulo no backend e, para preview, no frontend;
- remover duplicação em `scheduleUtils.js` somente após paridade.

Gate: vetores de entrada existentes produzem resultados equivalentes e todos os ADRs de escala estão cobertos.

### Etapa 4 — Backend modular por fatias

Migrar uma fatia por PR, nesta ordem:

1. voluntários e proficiências;
2. indisponibilidades;
3. rascunho, geração, publicação e versões;
4. acesso, cadastro e aprovação;
5. trocas e notificações;
6. confirmações e lembretes.

Em cada fatia: extrair domínio/aplicação, criar adapters, ligar no composition root, executar testes de interface e remover somente o trecho legado substituído. Trocas/publicações entram depois por exigirem transações mais complexas.

Gate: `server/index.js` deixa de conter regras; ele é substituído por bootstrap e routers compostos.

### Etapa 5 — Frontend modular por jornadas

- introduzir router declarativo e providers no app shell;
- migrar autenticação/cadastro/recuperação;
- migrar portal do voluntário;
- migrar gestão de voluntários e indisponibilidades;
- migrar edição/publicação da escala;
- usar queries/mutations tipadas e invalidação explícita;
- carregar sob demanda rotas administrativas e o exportador PDF.

Gate: `App.jsx` não orquestra regras nem chamadas HTTP; o bundle inicial fica abaixo do limite de 500 kB ou há justificativa registrada por chunk.

### Etapa 6 — Persistência e cutover

- implementar o adapter PostgreSQL tipado e migrations;
- executar testes de integração com PostgreSQL compatível;
- migrar dados em staging, comparar contagens/checksums e ensaiar rollback;
- configurar conexão/TLS corretos no Render;
- desabilitar exposição desnecessária na Data API e auditar RLS/grants;
- remover criação de schema no startup;
- remover SQLite da aplicação após uma janela de estabilidade.

Gate: restore ensaiado, advisors sem achados críticos, migration dry-run aprovada e nenhuma perda de histórico.

### Etapa 7 — Remoção do legado

- desativar endpoints/fallbacks antigos com telemetria e período de compatibilidade;
- remover mocks obsoletos, adapters temporários e as marcações `@ts-nocheck` restantes;
- manter `allowJs: false` e tornar `noEmitOnError` obrigatório;
- atualizar README, runbooks, ADRs e diagrama;
- comparar métricas funcionais e operacionais com o baseline.

## Estratégia de PRs

PRs devem ser pequenas e manter o sistema executável. Uma sequência sugerida:

1. baseline, Node 24 e suíte estável;
2. workspaces, tsconfig e lint sem mover regras;
3. contratos e fatia de voluntários ponta a ponta;
4. `scheduling-domain` e testes;
5. módulos backend de disponibilidade/escala;
6. módulos backend de acesso;
7. módulos backend de troca/confirmação;
8. app shell e autenticação frontend;
9. portal e administração frontend;
10. editor de escala e code splitting;
11. migrações PostgreSQL/Supabase e ensaio de dados;
12. cutover e remoção do legado.

Cada PR inclui testes, documentação da interface alterada e plano de rollback. Renomear/mover arquivos deve ser separado de alterações lógicas sempre que isso melhorar a revisão.

## Critérios finais de aceite

- frontend e backend executam em TypeScript estrito, sem `allowJs`;
- produção usa Node 24 LTS fixado e suportado;
- dependências entre camadas são verificadas automaticamente;
- domínio não importa React, Express, Supabase, SMTP, Drizzle ou `process.env`;
- controllers só validam/mapeiam e chamam a interface do módulo;
- componentes não acessam banco, DTO cru ou singleton global de infraestrutura;
- uma única implementação pura contém geração e validação de escala;
- contratos HTTP são validados em runtime e tipados em compile time;
- migrations são versionadas e o startup não altera schema;
- Supabase Auth/secret/grants/RLS seguem privilégio mínimo;
- todas as regras dos ADRs têm testes observáveis;
- CI executa lint, typecheck, testes, verificação arquitetural e build;
- e2e cobre cadastro/aprovação, publicação, confirmação e troca;
- bundle inicial respeita o orçamento definido;
- rollback e restauração foram ensaiados.

## Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Reescrita longa sem entrega | Strangler por fatias verticais e compatibilidade temporária. |
| Tipos apenas mascararem DTOs inconsistentes | Validação runtime na entrada e saída dos adapters. |
| Duplicação de regras front/back | `scheduling-domain` puro, com revalidação obrigatória no backend. |
| Excesso de abstrações de Clean Architecture | Interfaces pequenas, ports apenas em seams reais e testes pela interface pública. |
| Perda de dados na troca de persistência | Migrations versionadas, backup, checksum, staging e rollback ensaiado. |
| Falhas de autorização durante reorganização | Testes negativos de contrato por role em toda fatia. |
| Bundle continuar crescendo | Rotas lazy, PDF sob demanda e budget no CI. |
| Supabase expor tabelas sem intenção | Schema privado/Data API desabilitada ou grants + RLS explícitos. |

## Referências técnicas verificadas

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [TypeScript documentation](https://www.typescriptlang.org/docs/)
- [React com TypeScript](https://react.dev/learn/typescript)
- [Vite e TypeScript](https://vite.dev/guide/features.html#typescript)
- [typescript-eslint com typed linting](https://typescript-eslint.io/getting-started/typed-linting/)
- [Supabase: conexão ao PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase: validação de usuário com `getUser`](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Supabase: segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api)
