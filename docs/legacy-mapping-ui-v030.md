# Etapa 7: manifesto de identidades locais na interface

Na página /backup-financeiro o Farol agora mostra **Preparar identidades para a futura importação**.

Requer conta financeira autenticada com AAL2, vínculo permitido e backup criptografado conferido.
Antes e depois do cálculo, verifica que o snapshot atual possui o mesmo fingerprint do
arquivo conferido. O manifesto usa `planLegacyIdentifiers`, gera SHA-256 por tipo de
registro/usuário/espaço, recusa IDs duplicados e referências inconsistentes e avisa
quando falta a data original dos pagamentos de gastos fixos.

A interface mostra apenas contagens; não envia IDs legados, conteúdo financeiro, hashes
ou senhas ao servidor. A tabela de correspondências do PostgreSQL Dev foi criada separadamente,
mas **continua vazia** até existir um serviço de importação comprovadamente seguro. Não há
botão de sincronização real nem rota HTTP de migração nesta Preview.
