# Proteção contra sobrescrita de alterações concorrentes (v0.14 Dev)

## Escopo

Implementação em `security/v0.14-auth-hardening` e schema do projeto Supabase **Dev**
`tvirkrjkgdtybtcundon`. NÃO foi aplicada na produção.
A API de Preview permanece com `FAROL_FINANCIAL_WRITES_ENABLED` inativa; a
Function de proxy do frontend permite apenas GET.

## Contrato HTTP

`GET /api/v1/workspaces/{workspaceId}/{transactions|recurring-bills|fixed-expenses|budgets}`
retorna `version` (inteiro positivo) em cada objeto financeiro.

Antes de editar ou excluir, o cliente deve buscar a versão atual da sua linha
e mandar `If-Match: "1"`, usando a versão que acabou de ler:

```http
PATCH /api/v1/workspaces/{workspaceId}/transactions/{transactionId}
Authorization: Bearer <access-token>
If-Match: "1"
Content-Type: application/json

{"description":"Compra corrigida"}
```

O `version` também é obrigatório para os demais catálogos e para `DELETE`,
com o **mesmo cabeçalho** `If-Match: "N"`. Não enviar `version` como campo de
edição no JSON; ele é controlado exclusivamente pelo servidor.

Respostas:

| Status | Significado |
|---|---|
| `200` | Atualização aceita, `data.version` incrementada em 1 |
| `204` | Exclusão aceita após comparar versão |
| `428` | Falta `If-Match` |
| `400` | Versão malformada, payload inválido ou outro erro de validação |
| `409` | `VERSION_CONFLICT`: registro mudou desde a leitura, atualização NÃO aplicada |
| `404` | Registro inexistente ou de outro workspace, sem revelar sua existência |
| `401/403` | Não autenticado, 2FA ausente, não autorizado ou escrita desabilitada |

**Tratamento pelo cliente:** ao receber `409`, não fazer retry automático
com versão antiga, nem sobrescrever. Informar ao usuário: “Este registro foi
alterado em outra sessão. Atualize os dados antes de salvar novamente.”
Permitir consultar a versão nova e reaplicar as alterações deliberadamente.
Sem `If-Match` não existe atalho de compatibilidade.

## Garantias implementadas

- Coluna `version INTEGER NOT NULL DEFAULT 1` e CHECK `version >= 1` nos
  modelos `Transaction`, `RecurringBill`, `FixedExpense`, `BudgetProject`.
- Prisma `updateManyAndReturn` faz UPDATE atômico incluindo
  `id + workspaceId + version esperada`, e incrementa `version` na mesma
  instrução.
- DELETE faz `deleteMany` com os mesmos 3 predicados.
- O backend só retorna `409` após conferir que o registro ainda existe NO
  MESMO workspace. Para IDs alheios, mantém `404`.
- Usuário autenticado, AAL2, associação com workspace e papel OWNER/EDITOR
  são checados antes da precondição.
- O Frontend atual é SOMENTE LEITURA; preserva `version` opcional no
  modelo de leitura, mas NÃO oferece edição.

## Testes e limites

- PostgreSQL Dev: UPDATE com versão 1 aceita; segundo UPDATE com versão 1
  afeta zero registros; DELETE com versão 1 afeta zero após incremento;
  referência a workspace alheio não altera; rollback de todas as alterações
  temporárias confirmou A=333 centavos e B=444 centavos intactos.
- Testes unitários cobrem API (428/409/200/204), atualização/rejeição na
  camada Prisma e isolamento por workspace.
- CI GitHub executa Prisma validate, migração em Postgres temporário,
  verificação de RLS, suite API e build TypeScript. Os resultados atuais
  devem ser consultados em Actions para o commit mais recente.
- **Não confundir com teste simultâneo em duas conexões reais:** ainda faltam
  testes E2E de contenção concorrente, carga e ciclo completo da UI.
- Deploy manual Vercel estava bloqueado por limite diário de 100; não
  considerar esta implementação em execução no backend Preview até confirmar
  deploy da branch.
- A migração de produção exige revisão e aplicação separada antes do deploy
  da versão que lê a coluna.

Referência: https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference
