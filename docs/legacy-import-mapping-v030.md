# Farol Finanças: mapeamento idempotente de identidades legadas (v0.30)

Esta etapa cria **infraestrutura de correspondências** para futura migração dos dados locais.
**Não existe endpoint de importação e não foram enviados registros de usuários para a nuvem.**

## Modelo PostgreSQL

A tabela `public."LegacyImportMapping"` registra:
- `ownerUserId` UUID do Supabase Auth, obtido exclusivamente de JWT validado no backend;
- `workspaceId` UUID do espaço online com associação OWNER;
- `entityType` categoria do registro do manifesto local, sem valor financeiro;
- `sourceWorkspaceKey` SHA-256 estável da identidade do espaço local;
- `sourceKey` SHA-256 de (titular + espaço local + tipo + identificador);
- `contentFingerprint` SHA-256 canônico do registro, usado para detectar alterações;
- `destinationRecordId` UUID do registro no PostgreSQL;
- `createdAt` data da associação.

Os campos de origem são hashes, não IDs antigos em texto claro. Não contêm nomes ou valores
financeiros, embora hashes não sejam criptografia reversível e não autorizem acesso.

### Índices e bloqueios
- `UNIQUE(ownerUserId, sourceKey)` impede importar a mesma origem duas vezes para um titular.
- `UNIQUE(entityType, destinationRecordId)` impede reutilizar um destino para duas origens.
- FKs para `User` e `Workspace`; checks para hex SHA-256 e tipos autorizados.
- RLS ligada, sem políticas para clientes, `PUBLIC`, `anon` e `authenticated` sem privilégios diretos.
- Esta tabela é controlada exclusivamente pela API Prisma após autenticação; **não** por PostgREST.

## Contrato transacional futuro
`PrismaLegacyImportMappingService.importOnce(source, createTarget)` executa em
`prisma.$transaction`, verifica OWNER no próprio PostgreSQL, verifica associação do espaço,
procura `sourceKey` existente **antes de criar**, compara conteúdo em caso de repetição,
chama `createTarget(tx)` apenas quando não existe mapeamento, verifica o registro
de destino no espaço autorizado, e grava o mapeamento na **mesma transação**.

Em conflito de índices concorrentes, Postgres aborta a transação; o futuro orquestrador
deverá repetir em uma nova transação e reutilizar a identidade estável. Não usar
`upsert` para atualizar silenciosamente fingerprints.

Pagamentos de gastos fixos sem data real **permanecem bloqueados**. O serviço ainda
não recebe pedidos de HTTP; não existe gravação por usuários na Preview.

## Pendências para liberar sincronização real
1. Implementar orquestrador autenticado que valide JWT, AAL2, papel OWNER e lote
   canônico no servidor, calculando novamente os SHA-256 a partir dos dados recebidos.
2. Garantir mapeamento de pais/filhos, valores, datas, faturas e revisão humana dos
   pagamentos sem data (não criar datas artificiais).
3. Proteger contra corrida no primeiro mapeamento de espaço e contra alterações
   simultâneas dos dados locais/nuvem.
4. Validar integrações contra PostgreSQL de QA isolado, com duas contas, lote
   repetido, transação falha, unicidade e rollback reais.
5. Manter a Preview com POST/PATCH/DELETE financeiros bloqueados até aprovação,
   backups verificados e importação idempotente comprovada.
6. Aplicar migrações em produção apenas após revisão e janela de implantação.

**Arquivo local .md anterior não é alterado automaticamente no Mac.**
