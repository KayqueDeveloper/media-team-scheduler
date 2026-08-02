# Algoritmo com Priorização por Equidade de Histórico Recente

Decidimos que o algoritmo de geração automática de escala utilizará a equidade de servidão histórica como critério primário de desempate ao alocar voluntários para vagas onde múltiplos membros são elegíveis.

## Regras de Pontuação do Algoritmo
1. O sistema calcula uma pontuação para cada voluntário elegível com base na contagem de escalas nos últimos 60 a 90 dias.
2. Voluntários com menor número total de servidões e maior tempo decorrido desde a última escala recebem prioridade mais alta na alocação.
3. Garante distribuição uniforme de oportunidades ao longo do ano para toda a equipe de transmissão.
