# Auditoria de escritas financeiras no Supabase Dev (2026-11-09)

**Projeto:** Farol Finanças  
**Ambiente:** Supabase Dev `tvirkrjkgdtybtcundon`, branch `security/v0.14-auth-hardening`  
**Produção:** não acessada nem modificada  
**Estado:** testes de rollback/escopo/integridade aprovados; **concorrência de atualizações pendente de correção**.

## Procedimento e escopo

Todos os testes de gravação SQL ocorreram em transações explícitas `BEGIN ... ROLLBACK`, utilizando UUIDs novos, descrições prefixadas `QA-SQL-` e somente os espaços fictícios:
- `QA - Conta atual` (A): lançamento original 333 centavos
- `QA - Conta B`: lançamento original 444 centavos

Não foram solicitadas chaves, códigos TOTP nem tokens dos usuários. Nenhuma flag de escrita financeira da API Preview foi habilitada.

## Evidências aprovadas

| Teste | Resultado |
| --- | --- |
| INSERT em `Transaction`, `RecurringBill`, `FixedExpense`, `BudgetProject` | Efetuado dentro da transação |
| UPDATE legítimo por `id + workspaceId` | 1 registro alterado em cada módulo |
| DELETE legítimo por `id + workspaceId` | 1 registro excluído em cada módulo |
| UPDATE de registro B passando escopo de workspace A | 0 registros alterados nos quatro módulos |
| DELETE de registro B passando escopo de workspace A | 0 registros excluídos nos quatro módulos |
| Registro B após tentativas cruzadas | Conservado e sem alterações |
| `ROLLBACK` | 0 registros temporários remanescentes nas quatro tabelas |
| `MonthlyBillEntry` com mesmo `(billId, yearMonth)` | Conflito rejeitado / `ON CONFLICT DO NOTHING` retornou 0 linhas |
| `FixedExpensePayment` com mesmo `(fixedExpenseId, yearMonth)` | Conflito rejeitado / `ON CONFLICT DO NOTHING` retornou 0 linhas |
| `Transaction.workspaceId` apontando para espaço inexistente | Foreign key rejeitou a referência |
| Saldo original A e B após todos os testes | 333 e 444 centavos, respectivamente |

As quatro tabelas financeiras possuem RLS habilitado e não concedem `INSERT`, `UPDATE` nem `DELETE` diretamente ao papel `authenticated`. Isso é uma proteção adicional; o Prisma da aplicação usa credenciais de servidor, então **a autorização principal continua sendo validada pelo backend**.

## Atenção: atualizações concorrentes

O repositório Prisma atualmente atualiza por `WHERE id = ... AND workspaceId = ...`, sem comparar um campo de versão ou valor anterior:
- `PrismaTransactionRepository.updateWithinWorkspace()`
- `PrismaFinancialCatalogMutations.update()`

O teste real de **edições sucessivas** confirmou que uma gravação posterior sobrescreve uma anterior, mesmo que seu autor tenha lido um estado desatualizado. Um `UPDATE` condicional com o valor esperado anterior retornou 0 linhas, indicando o caminho para uma proteção contra conflitos.

**Não foi obtido um teste de contenção simultânea conclusivo com duas conexões.** Uma tentativa com advisory locks por duas chamadas SQL do conector não confirmou sobreposição temporal. Não marcar concorrência real como validada.

### Correção recomendada antes de habilitar gravações financeiras

1. Incluir `version INTEGER NOT NULL DEFAULT 1` (ou campo de revisão equivalente) nas entidades editáveis, via migração revisada.
2. Exigir `expectedVersion` em PATCH para clientes online; no `UPDATE ... WHERE workspaceId = ... AND id = ... AND version = expectedVersion`, incrementar a versão atomicamente.
3. Retornar `409 Conflict` quando o registro for alterado por outra sessão; não substituir silenciosamente.
4. Adicionar testes reais com conexões concorrentes: atualização simultânea no mesmo registro, nova leitura após conflito, retry informado e unicidade por mês.
5. Manter Preview em somente leitura até que testes de integração concorrentes, recuperação, backup e segredos estejam aprovados.

**Conclusão:** autorização e filtros por workspace funcionaram nas alterações SQL; rollback e integridade básica funcionaram. Concorrência de edição é uma lacuna e impede liberar escrita financeira como recurso pronto para dados reais.
