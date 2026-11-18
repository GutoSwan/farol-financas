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

## Bloqueio atual

- `DATABASE_URL` **ainda não existe** nesta branch: nenhuma credencial de Postgres foi transmitida ou armazenada.
- A role `farol_preview_httpqa_ro` **não foi criada**. O procedimento automático que geraria e transferiria o segredo entre conectores foi bloqueado por segurança; não foi repetido por métodos alternativos.
- O Preview QA **deve falhar fechado** sem essa conexão. Não declarar `/ready` ou Owner/Viewer HTTP como aprovados enquanto não for configurada uma credencial válida e checada.
- Para executar a integração real ainda faltam: criar role com SELECT limitado a espaços QA e função privada de `auth.sessions`, guardar DATABASE_URL como variável **Sensitive** na Vercel sem revelar a senha em chat, publicar novamente, confirmar `/ready`, criar duas novas contas Auth descartáveis com MFA AAL2 e espaços QA, executar teste e limpar todos os registros de QA.

## Controle de segurança obrigatório para futura role

- LOGIN sem `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`.
- `USAGE` apenas nos schemas necessários.
- `SELECT` exclusivamente em `Workspace`, `WorkspaceMember` e `Transaction` e política RLS restringindo a dois espaços QA novos.
- `EXECUTE` apenas na função privada `farol_qa_private.is_active_session(uuid,uuid)` para revogação de sessões; nada de leitura direta em `auth.users` ou `auth.sessions`.
- Zero permissões `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` ou `CREATE` em tabelas do aplicativo.
- Não habilitar `FAROL_FINANCIAL_WRITES_ENABLED`, `FAROL_PREVIEW_SYNC_QA_TRANSACTION_WRITES`, `FAROL_INVOICE_UPLOADS_ENABLED` ou `FAROL_INVOICE_READS_ENABLED`.
- Não reutilizar DATABASE_URL de produção, não registrar senha no Git ou no chat, não criar bypass público da Vercel.

**Situação:** configuração segura da Preview concluída na parte não secreta; credencial e teste integrado pendentes.
