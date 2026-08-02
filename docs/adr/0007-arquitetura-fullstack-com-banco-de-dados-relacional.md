# Arquitetura Fullstack com Banco de Dados Relacional

Decidimos adotar uma arquitetura Fullstack baseada em Web Framework moderno (ex: Next.js / React com Node.js) conectado a um Banco de Dados Relacional (PostgreSQL / Supabase / SQLite via ORM como Prisma/Drizzle).

## Considerações
- Garante persistência centralizada na nuvem desde a Fase 1, permitindo que os dados de voluntários, proficiências, histórico e escalas fiquem seguros e acessíveis de qualquer dispositivo pelo Líder.
- Prepara o sistema nativamente para a Fase 2 (Portal do Voluntário), pois a estrutura de banco de dados, tabelas relacionais e APIs já estará implementada e pronta para receber autenticação de usuários.
