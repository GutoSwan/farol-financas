# Farol Finanças — Etapa 4: pagamentos fixos sem data exata (16/11/2026)

## Objetivo
Preservar os meses já marcados como pagos no navegador, sem atribuir uma
data de quitação inventada ao histórico.

## Preparação implementada (código e banco Dev, sem transferência)
- Prisma: `FixedExpensePayment.paidAt` agora aceita `NULL` e mantém default
  de horário para pagamentos novos.
- Migração SQL versionada: remove apenas `NOT NULL` da coluna. **Aplicada em
  16/11/2026 somente ao Supabase Dev** (`tvirkrjkgdtybtcundon`); produção não alterada.
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
1. **Concluído em Dev:** esquema confirmado com `paidAt` anulável, default
   `CURRENT_TIMESTAMP` preservado e 0 pagamentos existentes na tabela.
2. Executar teste de importação real em PostgreSQL de QA com rollback,
   repetição, interrupção e duas contas autenticadas (ainda pendente).
3. Validar colaboração: os quatro espaços QA existentes no Dev têm um membro
   cada; **ainda não existe prova de sincronização entre dois logins no mesmo
   espaço**. Testar compartilhamento familiar e Valora3D sem cruzar dados.
4. Resolver migração de dados superiores ao limite de 25 por categoria e
   reconciliação de mudanças concorrentes.
5. Somente com backup, revisão de origem/destino e autorização explícita
   considerar liberar a flag de transferência.

**A rota `legacy-connect` continua DESLIGADA**, `allowLegacyConnectionWrites:false`.
Preview e produção não receberam registros financeiros por esta preparação.
