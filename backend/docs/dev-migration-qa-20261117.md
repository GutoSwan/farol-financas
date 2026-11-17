# Migração financeira — teste reversível no Supabase Dev (17/11/2026)

**Ambiente:** exclusivamente Supabase Dev `tvirkrjkgdtybtcundon`.
**Produção:** intocada. **Dados financeiros reais:** não acessados nem alterados.

O script `backend/sql/qa_legacy_migration_rollback_dev.sql` executa um teste
de integração **do esquema PostgreSQL**, usando somente usuários e registros
fictícios, dentro de `BEGIN` / `ROLLBACK`.

## Evidências observadas

- Resultado do SQL: `QA_DEV_ROLLBACK_PASS`.
- Inserções de conta mensal e pagamento, gasto fixo com data de quitação
  desconhecida, orçamento, item, cotação e lançamento mantiveram suas relações.
- A identidade `OWNER` foi distinguida de um membro `VIEWER`.
- A chave de migração duplicada foi recusada pelo índice único.
- Um histórico mensal sem conta-pai foi recusado pela chave estrangeira.
- Após o `ROLLBACK`, uma consulta independente retornou **zero** espaços,
  lançamentos e projetos com os marcadores do teste.
- O papel `authenticated` continua sem leitura direta da tabela financeira
  `public."Transaction"`.

## Limitações e próxima validação

O teste confirma o comportamento real de **restrições e transação no banco**.
Não chama o serviço Prisma nem a API HTTP, e por isso não substitui um E2E
autenticado (AAL2, OWNER, rejeição de VIEWER, repetição sem duplicações, erro
intermediário e consulta posterior). A API de migração permanece desativada
por configuração. Só habilitar escritas Dev após revisar credenciais e executar
um teste isolado da API com identificações fictícias; nunca habilitar Preview
ou produção automaticamente.

### Complemento — autorização da API com JWT assinado

`backend/tests/signedJwtApiIsolation.test.ts` testa o roteamento HTTP real do
Fastify com JWTs RSA assinados, uma JWKS servida **somente em localhost** e
repositórios fictícios em memória. Verifica assinatura falsa, emissor e público
inválidos, token expirado, sessão revogada, AAL1 com MFA, isolamento de dois
espaços, leitura de VIEWER, negação de escrita e exigência de OWNER AAL2 para
conectar registros. O build da API passou com **302 testes**.

**Escopo distinto:** esta etapa valida JWT + middleware + rotas sem chamar
Supabase Dev, Prisma nem o conector de migração real. O E2E integrado de
migração com Auth Dev e persistência PostgreSQL continua pendente, e as
gravações de migração seguem desativadas na Preview e em produção.
