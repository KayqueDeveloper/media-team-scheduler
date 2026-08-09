# Fonte de Verdade da Fase 1

Na Fase 1, a API Express conectada ao SQLite será a única fonte oficial dos dados de negócio: voluntários, proficiências, indisponibilidades, escalas, alocações e versões publicadas. O `localStorage` poderá guardar somente preferências temporárias da interface. Essa decisão elimina divergências entre dispositivos e permite que a persistência centralizada seja evoluída posteriormente para um banco relacional hospedado sem alterar o domínio do sistema.
