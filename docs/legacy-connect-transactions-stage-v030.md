# Farol Finanças: conexão segura de registros (Preview)

## O que o backend já prepara
A rota autenticada `POST /api/v1/workspaces/:workspaceId/legacy-connect` foi criada,
**mas permanece explicitamente DESATIVADA** no entrypoint, mesmo se outras
escritas estiverem ligadas. Não há botão de envio no frontend.

A classe de conexão reconhece, em um mesmo espaço local:
- Lançamentos, incluindo vínculos aos projetos/itens.
- Contas mensais e histórico por competência.
- Gastos fixos sem meses pagos.
- Projetos de orçamento, itens e cotações.

A entrada é validada pelo backend, com limites de até 25 registros por
categoria e rejeição de IDs duplicados, vínculos ausentes e campos extras.
Valores monetários são em centavos, sem arredondamentos.
Pagamentos de despesas fixas cujo histórico não registra a data da quitação
**não são migrados automaticamente**.

## Regras de segurança
- É necessário JWT válido, MFA AAL2 e papel OWNER no espaço online.
- No primeiro vínculo, o espaço remoto precisa estar vazio.
- Os hashes SHA-256 de origem e conteúdo são calculados **no backend**
  usando o mesmo formato do manifesto do navegador.
- Referências entre contas, históricos, projetos, itens e lançamentos
  são traduzidas para os UUIDs dos novos registros no PostgreSQL.
- Toda a ligação e seus registros ocorrem dentro da mesma transação
  `Serializable`; em falha, toda a tentativa é desfeita.
- Reenvio idêntico reutiliza mapeamentos; dados modificados geram conflito.

## Verificação concluída em 12/11/2026
Foi realizado teste direto contra o **PostgreSQL Supabase Dev**,
com registros fictícios dentro de `BEGIN ... ROLLBACK`, verificando
restrições de unicidade e cancelamento em falha. O banco permaneceu
com 4 espaços, 4 lançamentos e 0 mapeamentos.
Os testes da classe de conexão usam um banco simulado em memória;
ainda falta um E2E autenticado rodando o serviço Prisma contra um
Postgres descartável.

## Antes da liberação real
1. Teste ponta a ponta com duas contas QA, MFA e Postgres isolado.
2. Conferência de espaços remotos existentes e reconhecimento de dados
   que possam ter sido acrescentados fora da migração.
3. Fluxo visual com confirmação explícita de destino, backup e totais.
4. Resolver a migração de parcelas já pagas sem data de quitação.
5. Lotes maiores, retomada segura e sincronização entre dispositivos.

**Não transferir dados pessoais nem promover para produção nesta etapa.**
