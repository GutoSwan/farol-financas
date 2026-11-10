# Farol Finanças: validação automática e regressão de segurança

## Objetivo
Garantir que as mudanças no Farol sejam testadas de modo repetível, mesmo quando a Vercel não está disponível para visualização. Há dois mecanismos **diferentes**, com ativação independente:

1. **CI de código com testes isolados:** não precisa de Vercel, internet para acessar o Farol ou credenciais reais do Supabase. Roda em alterações das branches `security/**`, em pull requests protegidos, e pode ser disparado manualmente. Inclui testes frontend, backend, build TypeScript, auditoria e migrações/RLS num PostgreSQL temporário do GitHub Actions.
2. **Monitoramento dos endpoints públicos da API:** depois da publicação e configuração explícita de um URL público HTTPS, consulta `/api/v1/health` e `/api/v1/ready`, sem autenticação e sem escrita. Detecta falhas de disponibilidade e de conexão com o banco, mas não prova que todas as operações e telas funcionam.

### Regressões novas
Os testes em `backend/tests/securityRegressionMatrix.test.ts` utilizam Fastify.inject com identidade e repositórios falsos. Verificam:
- Token ausente/inválido e proteção de dados em respostas não autenticadas
- Sessões AAL1 bloqueadas em leitura/escrita financeira e AAL2 autorizado
- Usuário estranho não consegue enumerar espaços, lançamentos, orçamentos, contas e faturas
- VIEWER pode consultar espaço próprio e não pode criar dados
- Campo userId ou workspaceId forjado no JSON é recusado
- Desativação de escrita em Preview tem prioridade mesmo sobre OWNER com MFA
- PATCH/DELETE exigem `If-Match`, e estrangeiro não edita apenas por conhecer ID/versão
- Listagem de faturas é parametrizada por `uploadedBy` do JWT, mesmo em espaço compartilhado
- Upload de PDF continua condicionado às flags de escrita + upload
- Cabeçalhos `no-store`, CSP e `nosniff` em dados financeiros

Os testes em `backend/tests/sessionAssuranceRegression.test.ts` cobrem:
- Validação da sessão ativa por ID junto ao usuário, sem depender apenas das claims do JWT
- Rejeição de sessão revogada ou banco indisponível
- AAL1/claims anormais não são promovidas a AAL2
- `role` inválida, contas anônimas e UUIDs inválidos são recusados antes da consulta

Esses testes **não** substituem testes E2E reais de Supabase, faturas e iPhone, que dependem de ambiente isolado.

## Cronogramas que estarão ativos após integração ao branch principal

| Workflow | Alteração | Agendamento (UTC) | Disparo manual |
|---|---|---|---|
| `.github/workflows/validate.yml` | Push `security/**` e PRs | Diariamente, 06:43 | Sim |
| `.github/workflows/security-audit.yml` | Push `security/**` e PRs | Quarta-feira, 06:57 | Sim |
| `.github/workflows/public-api-smoke.yml` | Não precisa alterar código | A cada 4h, minuto 17 | Sim |

**Importante:** o GitHub Actions executa workflows de `schedule` apenas na **branch padrão**. Como os arquivos estão numa PR de desenvolvimento, **os horários acima ainda não estão ativos**. Merge no branch principal é pré-requisito. O GitHub pode atrasar ou suspender agendamentos por limitações/inatividade.

## Habilitação do monitor público depois que a API estiver estável

1. Publicar e verificar o Farol numa URL HTTPS pública estável.
2. No GitHub: `Settings > Secrets and variables > Actions > Variables`.
3. Criar a variável **`FAROL_PUBLIC_API_BASE_URL`** com apenas a origem pública (por exemplo, `https://exemplo.vercel.app/`). Não incluir token, parâmetros, caminho ou segredo.
4. Depois da integração do workflow à branch padrão, executar `Actions > Monitorar API pública do Farol > Run workflow`.
5. O job **Health + readiness HTTPS** deve ficar verde; se falhar, conferir o log. Enquanto a variável não existir, o job aparecerá como **ignorado** e **nenhum teste público estará ativo**.
6. Os dois endpoints devem retornar HTTP 200 e JSON com `status: "ok"` e `status: "ready"` respectivamente. Falha de banco não é tratada como sucesso.

A verificação pública não consulta dados financeiros, não autentica usuários, não armazena credenciais e não faz POST/PATCH/DELETE.

## Limitações e cuidados

- CI verde **não** significa ausência de qualquer vulnerabilidade, nem garante que login, QR Code, recuperação de conta, PWA/iPhone e fluxos reais funcionem em produção.
- O check público mede disponibilidade da API, não autenticação nem funcionamento da interface. Para isso serão necessários testes E2E com contas de teste no **Supabase Dev**, separados da produção.
- Mudanças em RLS/migrações de produção **não** são executadas automaticamente pelo workflow. O banco em CI é efêmero.
- Nenhum CI deve receber `service_role` real ou apontar para o Supabase de produção.
- Manter as PRs como rascunho até o ciclo de integração e QA.
