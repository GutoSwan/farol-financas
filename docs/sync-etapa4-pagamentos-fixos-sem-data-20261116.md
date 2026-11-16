# Farol Finanças — Etapa 4: pagamentos fixos sem data exata (16/11/2026)

## Objetivo
Preservar os meses já marcados como pagos no navegador, sem atribuir uma
data de quitação inventada ao histórico.

## Preparação implementada (somente código, sem transferência)
- Prisma: `FixedExpensePayment.paidAt` agora aceita `NULL` e mantém default
  de horário para pagamentos novos.
- Migração SQL versionada: remove apenas `NOT NULL` da coluna. **Não foi aplicada
  ao Supabase Dev nem produção nesta etapa.**
- A transferência reconhece cada mês pago como linha independente, ligada
  ao gasto fixo correto e ao espaço autorizado, com `paidAt: null`.
- O backend recalcula a chave idempotente por titular, espaço, gasto e mês;
  repetições exatas são reutilizadas e divergências causam erro, sem sobrescrever.
- Validação rejeita competências pagas duplicadas, fora da vigência e lotes com
  mais de 25 pagamentos.
- A revisão mostra os meses e exige confirmação específica de que a data
  original é desconhecida. O backend também exige essa confirmação no lote.
- O backup local não é apagado e nunca é substituído pela transferência.

## Segurança e próximos passos
1. Conferir o esquema e aplicar a migração **somente no Supabase Dev isolado**,
   depois verificar que `paidAt` é anulável.
2. Executar a transação em PostgreSQL descartável, incluindo rollback,
   repetição, interrupção e duas contas QA.
3. Provar que um usuário não acessa o espaço do outro; conferir quando Ana
   deve compartilhar o mesmo espaço familiar e quando Valora3D fica separado.
4. Resolver migração de dados superiores ao limite de 25 por categoria e
   reconciliação de mudanças concorrentes.
5. Somente com backup, revisão de origem/destino e autorização explícita
   considerar liberar a flag de transferência.

**A rota `legacy-connect` continua DESLIGADA**, `allowLegacyConnectionWrites:false`.
Preview e produção não receberam registros financeiros por esta preparação.
