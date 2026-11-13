# Farol Finanças: contagem exata da nuvem antes da migração (13/11/2026)

## O que foi implementado
- `GET /api/v1/workspaces/:workspaceId/legacy-readiness` consulta nove contagens reais
  no **mesmo snapshot PostgreSQL**: lançamentos, contas mensais, históricos, gastos fixos,
  pagamentos fixos, projetos, itens, cotações e correspondências de importações anteriores.
- Proteção dupla: JWT validado + MFA AAL2 + OWNER exigidos na rota e, novamente,
  OWNER validado dentro da transação de leitura no Prisma.
- Nenhum documento, nome, valor, arquivo de backup ou registro financeiro local
  é enviado por essa requisição. Não há POST, PATCH ou DELETE.
- A tela `/revisar-migracao` substitui quatro consultas paginadas por um GET
  de contagens exatas; destaca filhos e mapeamentos que antes poderiam passar despercebidos.
- A resposta não concede autorização de importação nem garante que o espaço
  seguirá vazio depois da conferência. A importação real revalidará o banco
  dentro da transação SERIALIZABLE e com controle de idempotência.

## Testes e garantia de segurança
- Validar ausência de JWT, nível AAL1, papel EDITOR, segunda conta e UUID inválido.
- Validar que nove tabelas são contadas em RepeatableRead, inclusive filhas.
- Workspace com só filhos ou só mapeamentos é marcado ocupado/incompatível.
- Simular erro da API e resposta incompleta, sem assumir que o destino está vazio.
- A flag `allowLegacyConnectionWrites: false` **permanece desativada**.
- Backup criptografado, revisão visual dos números e confirmação explícita
  do titular continuarão obrigatórios antes de qualquer importação.

## Próximos bloqueios
- Teste E2E autenticado com duas contas QA (ambas MFA), banco descartável e
  resposta ao repetir / interromper a importação por lote.
- Resolução explícita dos pagamentos de gastos fixos antigos sem data exata.
- Garantir reconciliação de espaço ocupado, falhas de rede e alterações simultâneas.
- Antes da transferência, usuário deve validar backup e aprovar destino e totais.
- Os dados locais não são apagados automaticamente.

## Credencial técnica de leitura (Supabase Dev)

- Projeto **exclusivo Dev**: `tvirkrjkgdtybtcundon`. Papel `farol_preview_adminqa_ro`, sem `BYPASSRLS`, sem `CREATE/INSERT/UPDATE/DELETE` e com `LOGIN` ativado separadamente do schema.
- `SELECT` foi concedido às 11 tabelas financeiras necessárias. Políticas RLS `TO farol_preview_adminqa_ro` preservam bloqueio a todos os demais papéis; a API valida JWT, sessão viva, AAL2 e proprietário antes de consultar os dados.
- Verificação de sessão é feita por `farol_qa_private.is_active_session(UUID, UUID)`, função SQL SECURITY DEFINER em schema **não exposto**, com `search_path` vazio e `EXECUTE` concedido exclusivamente ao papel técnico. Nenhum acesso direto a `auth.users` ou `auth.sessions`.
- O frontend QA usa Supabase Dev; o backend QA usa uma `DATABASE_URL` de pooler Dev, guardada somente na Vercel. O verificador de ambiente rejeita outros projetos/usuários de DB e só permite GET.
- Sem ativação da rota `legacy-connect`, sem alteração dos dados financeiros reais e sem publicação em produção.

## Ativação da conta técnica (ação manual de credencial)

Validação em 13/11/2026: papel `farol_preview_adminqa_ro` criado SOMENTE em
Supabase Dev e mantido `NOLOGIN`. Políticas RLS SELECT presentes nas 11 tabelas.
Verificado: SELECT permitido, INSERT/UPDATE/DELETE negados, sem BYPASSRLS,
sem superuser, sem acesso direto às tabelas `auth.*`.
Schema `farol_qa_private` não exposto: o papel só executa
`is_active_session(uuid,uuid)`, que retorna um booleano.

A integração impede automatizar o passo de senha. **Não inserir credenciais no
GitHub, no chat, em commits ou na documentação.** O operador deve:

1. No SQL Editor de **Farol Finanças Dev**, gerar uma senha aleatória de pelo
   menos 32 caracteres usando um gerador seguro, armazená-la privadamente e executar:
   `ALTER ROLE farol_preview_adminqa_ro WITH LOGIN PASSWORD '<senha_aleatoria>';`
   Usar apenas caracteres hexadecimais facilita o uso seguro na URL.
2. No Supabase Dev, botão **Connect > Transaction pooler**, copiar o host
   real (índice aws-0/aws-1 NÃO deve ser inferido pela região).
3. Na Vercel, projeto **farol-api**, Preview limitada à branch
   `feat/migration-exact-cloud-readiness-20261113`, substituir somente
   `DATABASE_URL` (atualmente propositalmente inválida) por:
   `postgresql://farol_preview_adminqa_ro.tvirkrjkgdtybtcundon:<senha>@<host-pooler>:6543/postgres?sslmode=require`
4. Redeploy da Preview backend; conferir `/api/v1/ready`, consulta exata
   autenticada, 2FA AAL2, OWNER, segunda conta negada e gravações 403.

Os demais nove parâmetros do backend foram criados apenas nessa branch:
`SUPABASE_URL` Dev, `FAROL_DEV_SUPABASE_REF`,
`FAROL_PREVIEW_ADMIN_QA_READONLY=true`,
`FAROL_PREVIEW_ADMIN_QA_AUTH_ONLY=false`,
`FAROL_FINANCIAL_WRITES_ENABLED=false`,
`FAROL_INVOICE_UPLOADS_ENABLED=false`,
`FAROL_INVOICE_READS_ENABLED=false`, `CORS_ORIGIN` Preview e
`DATABASE_URL` inválida. Enquanto houver placeholder e role NOLOGIN,
a API falha fechada, sem tocar o banco de produção.

Não ativar importações nem liberar dados financeiros reais antes dos testes
autenticados em Supabase Dev e da confirmação explícita do titular.
