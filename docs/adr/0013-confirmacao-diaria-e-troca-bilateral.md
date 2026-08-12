# Confirmação diária de serviço e troca bilateral

## Status

Aceito. Esta decisão substitui a possibilidade de substituição unilateral descrita no ADR 0004; permanecem válidas as flexibilizações de frequência para trocas aceitas.

## Decisão

Para toda alocação de uma escala publicada, tanto no turno da manhã quanto no da noite, o sistema cria uma confirmação a partir de três dias antes do culto. Enquanto não houver uma resposta válida, envia um lembrete por e-mail uma vez por dia.

O voluntário pode:

1. confirmar a presença com uma única ação, sem informar motivo; ou
2. solicitar a troca de seu dia/turno com outro voluntário já escalado, informando obrigatoriamente o motivo.

A troca só é aplicada depois do aceite do outro voluntário. Até lá, o destinatário recebe lembretes diários. Se ele rejeitar, ou se o solicitante cancelar, a confirmação original volta a aguardar resposta e os lembretes ao solicitante são retomados.

Na aceitação, as duas alocações trocam de voluntário de forma atômica, uma nova versão publicada é registrada e ambas ficam confirmadas. Os dois lados precisam atender proficiência, turno permitido, disponibilidade e ausência de conflito no domingo de destino. Limites mensais e de domingos consecutivos continuam flexibilizados conforme o ADR 0004.

## Consequências

- Não existe recusa ou cancelamento unilateral da presença pela confirmação pública.
- O link público é assinado e identifica apenas uma confirmação; em produção, o segredo de assinatura é obrigatório.
- O envio diário deve ser acionado por um agendador externo e usa chave de idempotência por confirmação/troca e data.
- O líder pode acompanhar confirmações, trocas pendentes e falhas de entrega no painel.
