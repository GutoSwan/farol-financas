# Farol Finanças: conexão transacional dos lançamentos (etapa inicial)

## Entregue
- O backend agora possui um serviço de conexão para um espaço local já existente
  e até **25 lançamentos sem vínculos orçamentários** por pedido.
- Validação no servidor (Zod) de todos os campos e rejeição de campos desconhecidos.
- SHA-256 dos registros calculado novamente no servidor a partir do conteúdo,
  com a mesma codificação do manifesto da interface. IDs/hash/clientes jamais autorizam acesso.
- Associação da origem e criação dos lançamentos no banco dentro da mesma
  transação PostgreSQL **Serializable**.
- Checagem de papel OWNER e existência do espaço no banco; nome correspondente obrigatório.
- Primeiro vínculo bloqueado se a nuvem já contém lançamentos, contas, gastos fixos
  ou orçamentos, evitando misturar bases desconhecidas.
- Repetição com o mesmo conteúdo reutiliza correspondências; mudança de conteúdo
  retorna conflito sem sobrescrita.
- IDs duplicados, datas inválidas, campos inesperados e lançamentos associados a
  orçamentos não migrados são rejeitados. Nenhum registro é descartado silenciosamente.
- Rota preparada: POST /api/v1/workspaces/:workspaceId/legacy-connect.

## Bloqueio obrigatório
A rota está **desativada por padrão e explicitamente com allowLegacyConnectionWrites: false**
no entrypoint do servidor. A flag geral de escrita também permanece desativada em Preview.
Não foi criado botão de importação real e **nenhum registro financeiro foi enviado**.
Testes são executados com injeção Fastify e banco falso, sem alterar dados reais.

## Próximas etapas
1. Testar o fluxo em PostgreSQL Dev isolado com duas contas e rollback real.
2. Incluir contas, históricos, gastos fixos, orçamentos e dependências pai-filho.
3. Resolver pagamentos antigos sem data, com decisão explícita do usuário.
4. Criar interface de confirmação de destino e resumo dos dados com prova de
   integridade e proteção contra alteração de sessão durante envio.
5. Só depois revisar liberação controlada de POST em um ambiente de teste
   realmente isolado; em produção exige aprovação e QA completo.
