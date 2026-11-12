# Farol Finanças: prévia de sincronização local/nuvem (2026-11-12)
A nova etapa 6 de /backup-financeiro compara contagens de dados financeiros **somente leitura**.
Requisitos: sessão Supabase autenticada, MFA AAL2, vínculo local permitido, arquivo de backup
criptografado conferido e fingerprint atual coincidente.
Consulta /me, lista de espaços da API e 4 GETs por espaço OWNER com correspondência única por nome.
Nunca envia registros locais. Não faz POST/PATCH/DELETE ou grava mapeamentos.
A coincidência por nome não estabelece identidade. Contagens de 50 são tratadas como truncadas.
Sem correspondência, nome duplicado, papel diferente de OWNER e dados remotos existentes são alertas.
Não compara pagamentos mensais, orçamento detalhado, nem faturas completas. Não confirma
ausência de duplicados ou autorização de sincronização.
A importação real exigirá tabela de mapeamento idempotente, transações, autorização SERVER-SIDE,
rollback e testes com 2 contas em Supabase Dev. Preview e produção não devem permitir migração ainda.
