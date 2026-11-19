# QA de isolamento HTTP Owner/Viewer — Supabase Dev — 18/11/2026

## Escopo, não executar na produção

- Supabase Dev: `tvirkrjkgdtybtcundon`.
- Host informado e validado para **Transaction Pooler**: `aws-1-sa-east-1.pooler.supabase.com`, porta `6543`, banco `postgres`.
- Nova branch **isolada**: `qa/owner-viewer-dev-isolation-20261118`.
- URL da API protegida: `https://farol-api-git-qa-owner-viewer-dev-isolation-20261118-farol13.vercel.app`.
- Branch financeira já existente `feat/password-safety-free-20261117` e Production **não modificadas** por este QA.

## Etapas executadas

- Código da branch QA ajustado para reconhecer somente a role `farol_preview_httpqa_ro.tvirkrjkgdtybtcundon` ao definir `FAROL_PREVIEW_HTTP_QA_READONLY=true` e `FAROL_PREVIEW_ADMIN_QA_READONLY=true`.
- Host do banco fixado em `aws-1-sa-east-1.pooler.supabase.com` e porta `6543`.
- Teste de unidade atualizado para rejeitar outros usuários PostgreSQL, outros hosts e gravação habilitada.
- O verificador de integração exige token OIDC temporário da Vercel, além de JWT Supabase com TOTP AAL2; a proteção de Deployments não foi desativada.
- Vercel `farol-api`: variáveis **não secretas** da branch QA configuradas com Auth-only=false, dev ref correto, ro=true, writes=false, uploads=false e reads de faturas=false. Tudo limitado a `Preview` e à branch QA.

## Conexão Dev concluída — 18/11/2026

- `DATABASE_URL` foi cadastrada pelo proprietário como variável **Sensitive** na Vercel, limitada ao `Preview` da branch QA. Sua senha **não** foi exposta no chat nem versionada.
- A role `farol_preview_httpqa_ro` foi habilitada para `LOGIN` exclusivamente no Supabase **Dev**. Validação em 19/11: sem `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS` ou `CREATE` no banco.
- Grants confirmados em 19/11: somente `SELECT` nas tabelas `Workspace`, `WorkspaceMember` e `Transaction`. Sem acesso a `User` ou permissões de escrita nessas tabelas.
- RLS `farol_httpqa_ro_select` confirmado nas três tabelas, restrito aos nomes exatos `QA - HTTP Owner Viewer compartilhado (Dev)` e `QA - HTTP Owner Viewer privado (Dev)`.
- Preview `dpl_FwCxSKyS61f9KczduhvjrBgq4n37`, commit `a01e869ad762a3e5d0c57897c436e0f6db6f7bd9`: estado `READY`.
- A API retornou HTTP 200 em `GET /api/v1/ready` com `{"status":"ready"}`, e HTTP 200 no health check. Os logs comprovaram conexão PostgreSQL com TLS e consultas `SELECT 1` pelo adapter Prisma.
- Build anterior do Preview: **308 testes aprovados**. Isto **não** substitui o teste Owner/Viewer real.
- Verificação de limpeza de 19/11: zero usuários com e-mail `farol-qa-%@example.com` e zero workspaces com os dois nomes do cenário. Não foram criadas novas contas nesta verificação.

## Pendente para aprovar Owner/Viewer HTTP

1. Criar **duas novas** contas técnicas descartáveis no Auth do Supabase Dev, sem usar contas pessoais nem as contas antigas.
2. Inscrever e confirmar fator TOTP em ambas; exigir sessão **AAL2**.
3. Criar dois espaços QA exclusivos, um compartilhado Owner/Viewer e outro privado Owner, com vínculos coerentes.
4. Executar `backend/scripts/verify-live-dev-auth-readonly.ts` contra a URL exata do Preview com token OIDC temporário da Vercel, sem divulgar tokens, sem desativar Deployment Protection e sem links de compartilhamento público.
5. Validar `/me`, `/workspaces`, leitura compartilhada, `404` do Viewer no espaço privado, `403` na tentativa bloqueada de migração e revogação de sessão. Em seguida remover **somente** as contas e espaços criados para este novo QA, após confirmação específica.
6. Antes de considerar o Farol seguro para uso real, revisar outras recomendações de segurança de Auth e publicar/testar a configuração definitiva no ambiente pertinente, sem assumir que o Dev equivale à produção.

**Alerta de segurança Dev, 19/11:** Supabase Advisor aponta `auth_leaked_password_protection` desativado. O painel informa que a proteção automática de senhas vazadas exige plano **Pro** ou superior. Não alterar cobrança sem autorização; manter exigência de senha forte e MFA no aplicativo. Supabase também sinaliza `User` e `invoice_documents` com RLS ativo e nenhuma política: revisar se o bloqueio deliberado é o esperado antes de liberar funcionalidades, não abrir políticas genericamente.

## Controle de segurança da role QA

- LOGIN sem `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`.
- `USAGE` apenas nos schemas necessários.
- `SELECT` exclusivamente em `Workspace`, `WorkspaceMember` e `Transaction` e política RLS restringindo a dois espaços QA novos.
- `EXECUTE` apenas na função privada `farol_qa_private.is_active_session(uuid,uuid)` para revogação de sessões; nada de leitura direta em `auth.users` ou `auth.sessions`.
- Zero permissões `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` ou `CREATE` em tabelas do aplicativo.
- Não habilitar `FAROL_FINANCIAL_WRITES_ENABLED`, `FAROL_PREVIEW_SYNC_QA_TRANSACTION_WRITES`, `FAROL_INVOICE_UPLOADS_ENABLED` ou `FAROL_INVOICE_READS_ENABLED`.
- Não reutilizar DATABASE_URL de produção, não registrar senha no Git ou no chat, não criar bypass público da Vercel.

**Situação em 19/11/2026:** conexão Dev e isolamento PostgreSQL confirmados; **Owner/Viewer HTTP ainda pendente**. Nada foi modificado na produção.
