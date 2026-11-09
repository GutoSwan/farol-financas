# Farol Finanças: migração de dados locais, etapa 2 (somente simulação)

Esta etapa acrescenta à tela `/backup-local` a ação **Verificar compatibilidade da migração**, disponível apenas após conferência de integridade de um backup criptografado com a senha da própria pessoa. Não envia a cópia financeira à API, não executa SQL e não altera valores do navegador.

## O que a simulação verifica

A análise cruza o formato do backup local com as restrições do schema `backend/prisma/schema.prisma`:
- Limites de nomes, descrições, categorias e valores monetários de até 2.147.483.647 centavos
- Meses e datas (inclusive 29 de fevereiro em anos não bissextos)
- Contas recorrentes e seu histórico mensal: existência da conta referenciada, par conta/mês sem duplicação
- Despesas fixas: intervalo de vigência, meses pagos repetidos e falta de data exata de pagamento
- Orçamentos: projetos, itens, cotações, estados válidos e referências não órfãs
- Lançamentos: tipo, categoria, valor, datas e vínculo consistente com orçamento
- Identificadores locais repetidos dentro de cada categoria
- Possíveis conflitos pelo nome de espaços que já existem na nuvem

As respostas apresentam **impedimentos** (não é seguro importar antes de resolver) e **avisos** (informações que devem ser reconciliadas, sem inventar datas). O relatório mostra apenas as primeiras 80 ocorrências, mas contabiliza todas as encontradas.

## Contrato de privacidade e de ambiente

- O snapshot financeiro é lido exclusivamente no navegador da pessoa que já vinculou seus dados à conta.
- Autenticação `getUser()`, MFA `aal2` e `legacyAccess === allowed` continuam sendo exigidos.
- Se houver backend online, o frontend realiza apenas `GET /api/v1/me` e `GET /api/v1/workspaces`. **Nenhum histórico, lançamento ou JSON de backup é transmitido.**
- A comparação atual com o backend verifica **somente nomes de espaços**, não conteúdos financeiros já existentes. Um nome diferente não prova ausência de duplicatas.
- Se a API estiver fora do ar, a simulação local funciona, porém retorna `CLOUD_COMPARISON_UNAVAILABLE` e **nunca** marca os dados como prontos para desenho de importação.
- Se a identidade informada pela API divergir do usuário Supabase validado, a simulação é recusada.
- Nenhuma função de persistência, exclusão, restauração ou upload é chamada pelo analisador puro.

## Pendências para etapa 3

1. Definir correspondência determinística, por titular + espaço + tipo + identificador legado, para UUIDs remotos, sem colisões.
2. Definir entidade própria de importação e chave de idempotência, de modo a nunca repetir registros ao retentar a operação.
3. Revisar mapeamento dos campos: `budget.status` minúsculo/hífen -> enum SQL; `transaction.kind` minúsculo -> enum SQL; datas locais -> `DateTime`/DATE UTC.
4. Decidir como tratar pagamentos sem data/hora real, mantendo rastreabilidade sem inventar precisão.
5. Implementar análise de duplicatas **por conteúdo/identificador de origem** com dados remotos protegidos por JWT, AAL2 e autorização explícita OWNER; preparar importação por lote/ transação PostgreSQL com rollback.
6. Validar com dois usuários, reenvio idempotente e falhas de rede; só depois considerar habilitar escrita em ambiente isolado.

**Nenhum banco de dados foi alterado nesta etapa.**
