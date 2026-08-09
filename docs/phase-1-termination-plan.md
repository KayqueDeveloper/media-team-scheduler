# Plano de Término da Fase 1

## Objetivo

Entregar um painel administrativo utilizável pelo líder, com uma única fonte de verdade persistida, geração/revisão/publicação da escala mensal e exportação oficial. Autenticação, portal do voluntário e trocas permanecem fora desta fase.

## Estado de partida

- A interface React, a matriz de edição, o solver, o exportador PDF e o compartilhamento para WhatsApp já existem como protótipo.
- A API Express, o repositório SQLite, o schema e o seed existem, mas o painel ainda usa `localStorage` e dados mockados.
- A publicação, a edição manual e as indisponibilidades ainda não estão persistidas de ponta a ponta.
- Build e testes precisam ser reinstalados/executados em um ambiente com as dependências do `package-lock.json`.

## Sequência de implementação

### 1. Tornar o ambiente verificável

- Instalar as dependências com o lockfile.
- Fazer `npm run build`, `npm test` e o teste de banco executarem de forma determinística.
- Criar testes de integração da API usando um banco temporário.
- Corrigir o solver para refletir as regras registradas nos ADRs, inclusive limite mensal dinâmico, mentor N3 e fallback de domingos consecutivos.

### 2. Consolidar persistência

- Criar um cliente de API no front-end e remover dados de negócio do `localStorage`.
- Carregar voluntários, proficiências, indisponibilidades e escala pelo backend.
- Manter o seed apenas para desenvolvimento e migração inicial.
- Preservar voluntários inativos e o histórico de alocações.

### 3. Completar o domínio administrativo

- Completar CRUD de voluntários, incluindo turno permitido e ativação/desativação.
- Persistir proficiências por função.
- Persistir indisponibilidades com validação da data de corte.
- Persistir alocações manuais e vagas travadas.
- Aplicar as seis funções e dois turnos fixos.

### 4. Fechar o ciclo da escala

- Gerar rascunho usando histórico real dos últimos 60–90 dias.
- Validar alocações principais N2/N3, treinandos N1 e mentor N3.
- Aplicar limites de turno, indisponibilidade, domingos consecutivos e limite mensal dinâmico.
- Permitir ajustes manuais válidos e exibir alertas de cobertura.
- Implementar Rascunho → Publicada → Reabertura explícita.
- Criar histórico de versões publicadas e registrar os alertas confirmados.

### 5. Fechar a distribuição

- Permitir prévia de rascunho claramente identificada.
- Liberar PDF oficial, impressão e compartilhamento somente para versão publicada.
- Garantir que o PDF use a versão publicada selecionada, não apenas o estado corrente do formulário.

### 6. Validar entrega

- Testes unitários do solver para todas as regras de negócio.
- Testes de API para CRUD, corte, publicação, reabertura e versões.
- Teste de fluxo completo: cadastrar → indisponibilizar → gerar → ajustar → publicar → exportar.
- Teste de regressão para mês com 4 domingos e mês com 5 domingos.
- Verificação visual do PDF em A4.
- Checklist de recuperação: reiniciar o servidor e confirmar que os dados permanecem disponíveis.

## Critérios de aceite

1. Dois carregamentos do painel em dispositivos/sessões diferentes exibem os mesmos dados persistidos.
2. Alterar um voluntário, proficiência, turno ou indisponibilidade atualiza o SQLite e reaparece após reinicialização.
3. Indisponibilidades após o dia 25 do mês anterior são rejeitadas para o mês correspondente.
4. O gerador usa histórico real, tenta distribuir equitativamente e permite domingos consecutivos quando necessários.
5. Nenhuma alocação principal é feita para voluntário abaixo de N2.
6. Todo N1 escalado aparece como treinando com mentor N3; sua participação consome os limites definidos.
7. Em mês de 5 domingos, o gerador pode usar uma terceira escala somente quando a cobertura exigir.
8. Edições manuais inválidas são rejeitadas; vagas descobertas geram alertas.
9. Publicação exige confirmação dos alertas, cria versão histórica e pode ser reaberta apenas por ação explícita.
10. PDF oficial e compartilhamento não estão disponíveis para rascunho.
11. `npm run build`, `npm test` e os testes de banco/integração passam em ambiente limpo.

## Fora do escopo

- Login e autenticação.
- Portal individual do voluntário.
- Auto-registro de indisponibilidade.
- Solicitação, aceite e notificação de trocas.
- Notificações por e-mail, WhatsApp ou push.
- Catálogo configurável de funções e turnos.

## Riscos que precisam de decisão técnica durante a implementação

- O SQLite atual é adequado para a Fase 1, mas deve ficar atrás da API para permitir migração futura.
- A unicidade de escala por mês precisa coexistir com o histórico de versões publicadas.
- A edição manual e o solver devem compartilhar o mesmo módulo de validação para não criarem regras divergentes.
- A publicação com alertas exige registrar a confirmação do líder junto da versão.
