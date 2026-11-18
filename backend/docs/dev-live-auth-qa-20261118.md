# E2E real de Auth — somente Supabase Dev

**Estado em 18/11/2026:** verificador preparado, mas teste real **ainda não
executado**: faltam duas contas Auth Dev descartáveis e seus MFA. Não criar
contas por SQL diretamente em `auth.users`; usar o Supabase Auth para manter
as sessões e identidades consistentes.

## Escopo técnico

- Origem Auth: `https://tvirkrjkgdtybtcundon.supabase.co` (Dev).
- API: `https://farol-api-git-feat-password-safety-free-20261117-farol13.vercel.app` (Preview).
- **Nunca** consultar, alterar ou criar registros em produção.
- Dois usuários descartáveis com e-mails identificáveis como `farol-qa-owner-*`
  e `farol-qa-viewer-*` (ou aliases `+farol-qa-owner-*` / `+farol-qa-viewer-*`).
- Ambos devem ter conta de e-mail confirmada e TOTP verificado.
- Dois espaços novos `QA - ...` no Dev: um compartilhado (`OWNER` e `VIEWER`),
  outro exclusivo do Owner (`OWNER`). Não usar espaços familiares reais.

## Execução local, sem compartilhar credenciais

No terminal do Mac, definir as variáveis somente na própria sessão. Não incluir
senhas, códigos TOTP, tokens ou URLs com credenciais no Git ou no ChatGPT.

```bash
export FAROL_QA_LIVE_DEV_AUTH_E2E=READ_ONLY_DEV
export FAROL_DEV_SUPABASE_REF=tvirkrjkgdtybtcundon
export SUPABASE_URL=https://tvirkrjkgdtybtcundon.supabase.co
export FAROL_QA_API_ORIGIN=https://farol-api-git-feat-password-safety-free-20261117-farol13.vercel.app
export SUPABASE_PUBLISHABLE_KEY='<chave pública somente do Dev>'
export FAROL_QA_OWNER_EMAIL='<email técnico de QA Owner>'
export FAROL_QA_VIEWER_EMAIL='<email técnico de QA Viewer>'
export FAROL_QA_SHARED_WORKSPACE_ID='<UUID do espaço QA compartilhado>'
export FAROL_QA_PRIVATE_WORKSPACE_ID='<UUID do espaço QA exclusivo do Owner>'
```

As linhas acima são **exemplos com placeholders**; não executam login real
até receberem os valores válidos. Para evitar que senhas fiquem no histórico
do terminal, no **zsh do Mac** informar cada senha de modo oculto:

```zsh
read -s 'FAROL_QA_OWNER_PASSWORD?Senha técnica Owner: '; echo
export FAROL_QA_OWNER_PASSWORD
read -s 'FAROL_QA_VIEWER_PASSWORD?Senha técnica Viewer: '; echo
export FAROL_QA_VIEWER_PASSWORD
```

Depois, no diretório `backend`, com as
dependências da raiz e do backend instaladas:

```bash
node --import tsx scripts/verify-live-dev-auth-readonly.ts
```

O script usa a biblioteca oficial do Supabase para autenticar cada conta,
solicita os códigos TOTP **no terminal**, confere AAL2, valida `/me`, os
vínculos `OWNER/VIEWER`, a leitura do espaço compartilhado, o bloqueio de
leitura cruzada e a rejeição da migração pelo Preview. Ao terminar, faz logout
das sessões QA. **Não grava finanças e não testa a importação positiva.**

## Limite de segurança

O teste **positivo** do serviço real de migração (`Prisma` + PostgreSQL)
precisa de uma execução separada, temporária e restrita ao Dev, com dados
fictícios e limpeza transacional. O endpoint de Preview continua bloqueado
por código; não habilitar gravações financeiras gerais nem reutilizar
credenciais de produção para executar esse teste.

## Evidências já concluídas

- Supabase Dev ativo, código e migrações preparados.
- Zero registros remanescentes da simulação anterior.
- `backend/sql/qa_legacy_migration_rollback_dev.sql`: `QA_DEV_ROLLBACK_PASS`.
- `backend/tests/signedJwtApiIsolation.test.ts`: autorização HTTP com JWTs RSA
  assinados em ambiente local, sem tokens reais.
- `backend/tests/liveDevAuthE2eGuard.test.ts`: bloqueio de Prod/URL arbitrária,
  contas não técnicas e flags de escrita indevidas.
- Build da API: **305 testes aprovados**.
