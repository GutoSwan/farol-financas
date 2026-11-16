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

## QA de compartilhamento no Supabase Dev (16/11/2026)
- Criados os espaços **QA - Casa compartilhada (Dev)** e **QA - Valora3D compartilhada (Dev)**;
  cada um tem duas contas de teste distintas, com papéis OWNER e EDITOR.
- Inserido **um lançamento fictício por espaço** (R$ 12,34 na Casa e
  R$ 56,78 na Valora3D). Não são registros reais de Gustavo ou Ana.
- Verificação SQL confirmou dois membros e um lançamento por espaço.
- Os quatro espaços QA anteriores continuam com um membro cada.
- **Preview QA configurada:** a branch `feat/valora3d-preparo-sincronizacao-20261116`
  usa variáveis próprias para frontend e API, Supabase Dev separado e papel
  PostgreSQL exclusivo `farol_preview_sync_ro` (SELECT limitado aos espaços
  `QA - %` por RLS; nenhum privilégio de escrita).
- **Validação em 16/11/2026:** API Dev `/api/v1/health` e `/api/v1/ready`
  retornaram HTTP 200. A ponte protegida de mesmo domínio do frontend
  também retornou HTTP 200 nas duas rotas; `/dados-online` abriu HTTP 200.
  Build do frontend: 231 testes aprovados. A proteção da Vercel permaneceu ativa.
- **Preview para QA:** https://farol-financas-git-feat-valora3d-preparo-sincron-817c2c-farol13.vercel.app/dados-online
- **Leitura validada pelo usuário (16/11):** as duas contas visualizaram
  R$ 12,34 na Casa compartilhada e R$ 56,78 na Valora3D compartilhada.
  O frontend principal continua local; essa leitura não migra dados reais.
- **Escrita de lançamentos QA (16/11):** preparada somente na branch Preview.
  Role técnica independente `farol_preview_sync_transactions_rw` com
  `SELECT, INSERT, UPDATE, DELETE` estritamente em `Transaction`,
  limitada via RLS aos dois espaços fictícios nomeados acima. A role
  principal `farol_preview_sync_ro` permanece somente leitura.
  O backend bloqueia demais módulos, espaços e rotas de escrita no Preview.
  A ponte de mesmo domínio aceita apenas POST/PATCH/DELETE de lançamentos
  com flag privada, autenticação Supabase, autorização OWNER/EDITOR no backend
  e versão `If-Match` para PATCH/DELETE. Nunca aceita migração automática.
  A tela `/dados-online` oferece criação, edição, exclusão e consulta
  periódica (15 s) apenas aos espaços de QA sob flag da branch.
- **Pendente:** teste ponta a ponta com duas sessões reais de gravação,
  conflito simultâneo, recarregamento e logout. Não foi transferido
  nenhum registro financeiro pessoal nem ativada escrita em Production.
- O token de automação da Vercel é exclusivo de transporte entre as funções
  protegidas; não substitui o JWT Supabase nem a verificação de permissão,
  não aparece no cliente e deve ser revogado ao encerrar o QA.

## Segurança e próximos passos
1. **Concluído em Dev:** esquema confirmado com `paidAt` anulável, default
   `CURRENT_TIMESTAMP` preservado e 0 pagamentos existentes na tabela.
2. Executar teste de importação real em PostgreSQL de QA com rollback,
   repetição, interrupção e duas contas autenticadas (ainda pendente).
3. **Vínculos QA preparados e leitura compartilhada validada** pelo usuário.
   Gravação e atualização entre sessões ainda dependem de QA manual.
4. Resolver migração de dados superiores ao limite de 25 por categoria e
   reconciliação de mudanças concorrentes.
5. Somente com backup, revisão de origem/destino e autorização explícita
   considerar liberar a flag de transferência.

**A rota `legacy-connect` continua DESLIGADA**, `allowLegacyConnectionWrites:false`.
Preview e produção não receberam registros financeiros por esta preparação.

## Retorno de segurança
- Flags e credenciais de escrita são exclusivas da branch QA na Vercel Preview.
- Ao encerrar o teste, retirar `FAROL_PREVIEW_SYNC_QA_TRANSACTION_WRITES`,
  `FAROL_QA_TRANSACTION_WRITES_ENABLED` e
  `VITE_FAROL_QA_TRANSACTION_WRITES_ENABLED`, revogar a role de escrita Dev
  e preservar os registros de QA para conferência até autorização de limpeza.
- Confundir este protótipo com sincronização do Farol principal é um erro:
  as telas de lançamentos reais continuam lendo dados locais, sem mesclagem.
