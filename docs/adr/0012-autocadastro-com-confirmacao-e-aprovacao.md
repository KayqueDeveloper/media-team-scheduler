# Autocadastro com confirmação de e-mail e aprovação do líder

## Contexto

O portal do voluntário já usa Supabase Auth, mas as contas eram provisionadas somente pelo líder. A equipe precisa permitir que novos voluntários solicitem acesso sem vinculação manual a um registro preexistente, preservando o controle da liderança sobre quem entra na equipe e pode ser escalado.

## Decisão

O sistema oferece um cadastro público com nome, e-mail, telefone brasileiro obrigatório e senha. O Supabase Auth cria a identidade e exige a confirmação do e-mail. Simultaneamente, a API cria um novo voluntário inativo e um usuário com `approval_status = PENDING`.

Cadastros não confirmados não aparecem no painel. Depois da confirmação, o líder pode editar nome e telefone, aprovar ou rejeitar. O e-mail é imutável porque identifica a conta no Supabase.

Na aprovação, usuário e voluntário são ativados. Nenhuma proficiência é criada, o que representa N0 e impede alocações até a configuração pelo líder. Na rejeição, a identidade do Supabase é excluída primeiro e os registros locais são removidos em seguida, liberando o e-mail para um novo cadastro.

O estado de aprovação é separado do campo `active`: pendência é um estágio de ingresso; inatividade é uma condição operacional de um voluntário já aprovado.

## Consequências

- O portal permanece inacessível até a aprovação.
- A fila administrativa mostra somente e-mails confirmados e não depende de notificações externas.
- Voluntários pendentes não aparecem na gestão normal nem participam da geração de escalas.
- A aplicação depende da confirmação de e-mail habilitada e da chave secreta disponível apenas no backend.
- A rejeição é destrutiva e exige confirmação explícita na interface.
