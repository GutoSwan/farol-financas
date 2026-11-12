# QA: migração de dados locais para o Supabase Dev (12/11/2026)

## Teste real de restrições e rollback no PostgreSQL Dev
Foi executado um roteiro SQL em **uma única transação BEGIN ... ROLLBACK**,
com UUIDs sintéticos que não pertencem a pessoas. Foram verificados:
1. Inserção de espaço temporário, titular QA, associação OWNER e lançamento fictício.
2. Correspondência estável para espaço e lançamento.
3. Repetição da mesma origem não cria nova correspondência.
4. Uma segunda origem tentando usar o mesmo destino viola unicidade.
5. Dados com fingerprint inválido falham; a subtransação desfaz a gravação do lançamento.
6. ROLLBACK remove TODOS os registros de teste.

Após o teste, os totais no Supabase Dev permaneceram:
- 4 espaços
- 4 lançamentos
- 0 correspondências legadas
- nenhum usuário sintético do QA persistido.

O SQL validou as proteções reais do **banco**; não executou ainda o
frontend autenticado contra essa infraestrutura.

## Serviço de conexão em desenvolvimento
O backend agora prepara a migração por lote de:
- lançamentos;
- contas mensais e histórico por competência;
- gastos fixos **sem meses pagos**;
- projetos de orçamento, itens e cotações;
- referências de lançamentos aos projetos e itens.

A camada de mapeamento evita reimportar registros e toda a transferência
de cada lote usa uma transação `Serializable`. Há testes automatizados
para pai/filho, envio repetido, mudança de valor, duplicações e rollback.

**Segurança:** `allowLegacyConnectionWrites: false` segue codificado
no entrypoint. A flag de gravação geral também continua bloqueada na Preview.
Não há botão para enviar registros pessoais. A exportação de backup segue
sendo a forma segura de preservar os dados locais.

## Restrições para liberar
- Teste de integração do serviço Prisma com Postgres descartável ou sandbox isolado.
- Conferência de permissões com duas contas reais de QA e MFA AAL2.
- Confirmação de destino e conteúdo pelo usuário ANTES de enviar o lote.
- Conferir totais dos espaços e detectar registros remotos não mapeados.
- Revisão dos pagamentos fixos históricos sem data de quitação original.
- Tratamento de lotes maiores, sincronização bidirecional e divergências.
- Não alterar produção nem ativar importação até cumprir todos os bloqueios.
