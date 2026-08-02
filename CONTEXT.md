# Escala de Transmissão

Sistema de gerenciamento e geração de escalas mensais para a equipe de transmissão da igreja, incluindo restrições de frequência, proficiência e solicitações de indisponibilidade/troca.

## Language

**Voluntário**:
Pessoa que integra a equipe de transmissão e pode ser escalada para servir nos cultos.
_Avoid_: Membro, operador, participante

**Função**:
Atribuição técnica específica exercida durante a transmissão (Grua, Câmera Fixa, Corte, vMix, Coordenador, Freehand).
_Avoid_: Área, papel, cargo, posto

**Turno**:
Período do domingo em que ocorre o culto e a transmissão (Manhã ou Noite).
_Avoid_: Período, horário, serviço

**Escala**:
Mapeamento de voluntários para cada função em cada turno de um determinado domingo do mês.
_Avoid_: Quadro, agenda, grade, planejamento

**Proficiência**:
Classificação em níveis (1 - Treinando, 2 - Apto, 3 - Sênior) atribuída a um voluntário em cada uma das 6 funções.
_Avoid_: Habilidade, nível de conhecimento, experiência binária


**Indisponibilidade**:
Registro prévio de datas e turnos em que o voluntário informa impossibilidade de servir, respeitando uma data de corte mensal.
_Avoid_: Bloqueio, restrição de agenda, falta


**Troca**:
Solicitação direta entre voluntários para permuta ou substituição de escala. Exige proficiência compatível na função, mas ignora limites de frequência mensal e restrições de domingos consecutivos.
_Avoid_: Substituição, permuta, repasse


**Publicação**:
Ação do líder de aprovar a proposta de escala gerada, tornando-a oficial e visível para todos os voluntários.
_Avoid_: Homologação, liberação, emissão

**Exportação PDF**:
Documento impresso/digital em PDF gerado a partir da escala publicada para fácil envio em grupos e impressão.
_Avoid_: Relatório, espelho da escala

**Equidade de Servidão**:
Critério do algoritmo que prioriza voluntários com menor histórico de alocações nos últimos meses para garantir rodízio justo.
_Avoid_: Fila, rodízio simples, sorteio


## Fases de Desenvolvimento

- **Fase 1**: Painel Administrativo do Líder (Gerador de Escala Inteligente + Gestão de Voluntários/Proficiências + Exportador PDF).
- **Fase 2**: Portal do Voluntário (Autenticação + Auto-gestão de Indisponibilidades + Trocas de Escala).


