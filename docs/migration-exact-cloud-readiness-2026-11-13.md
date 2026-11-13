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
