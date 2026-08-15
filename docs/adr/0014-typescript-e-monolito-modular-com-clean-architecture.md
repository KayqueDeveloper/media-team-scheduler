# TypeScript e monólito modular com Clean Architecture

## Status

Aceito em 2026-08-12.

## Contexto

O sistema cresceu mantendo regras, transporte HTTP, persistência e estado de interface nos mesmos arquivos. O gerador e a validação da escala também passaram a existir em mais de um lugar. Isso aumenta o custo e o risco de alterar os fluxos definidos nos ADRs 0001 a 0013.

## Decisão

O sistema será mantido como um monólito modular em um repositório npm com três tipos de artefato:

- `apps/api`: interface Node.js/Express, módulos de backend e composition root;
- `apps/web`: interface React, módulos de frontend e app shell;
- `packages`: contratos de transporte e módulos puros realmente compartilháveis.

TypeScript estrito é obrigatório para código novo. Desde 2026-08-13 não há mais código-fonte JavaScript/JSX; módulos legados convertidos podem manter `@ts-nocheck` apenas durante a migração incremental descrita em `docs/typescript-clean-architecture-migration-plan.md`.

Cada módulo expõe uma interface pequena e esconde sua implementação. Ports são criados somente para seams com adapters reais, como Supabase Auth, SMTP, relógio e transporte HTTP. Frameworks e drivers ficam nos adapters; o domínio não depende deles.

O backend permanece a autoridade para regras e autorização. O módulo puro `scheduling-domain` pode ser usado pelo frontend para feedback imediato, mas toda alteração é revalidada pelo backend antes de persistir ou publicar.

PostgreSQL é a persistência de produção. Alterações de schema passam por migrations versionadas; o startup apenas verifica conectividade. As tabelas internas não são expostas à Data API para `anon` ou `authenticated`.

## Consequências

- a migração ocorre por fatias verticais sem interrupção do produto;
- contratos são validados em runtime e tipados em compile time;
- dependências entre camadas são verificadas automaticamente;
- adapters legados podem existir temporariamente, mas precisam ser removidos ao final da migração;
- mudanças de schema exigem migration e ensaio de rollback;
- não serão criadas interfaces ou classes sem variação ou comportamento que justifique o seam.
