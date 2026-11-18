# E2E real de Auth — somente Supabase Dev

**Estado em 18/11/2026:** teste real de **Supabase Auth Dev concluído** com
duas contas técnicas e MFA, com **limpeza integral dos objetos QA confirmada**.
A validação HTTP Owner/Viewer da **API Preview** continua **pendente** por
proteção de acesso da Vercel. Não criar nem excluir usuários diretamente por
SQL em `auth.users`; utilizar o Supabase Auth/Admin.

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

## Execução real de 18/11/2026 — resultados e limpeza concluída

- Supabase Auth Dev: duas contas descartáveis criadas pelo formulário oficial,
  sem enviar e-mails reais. MFA TOTP registrado e confirmado em cada uma.
- Teste independente com a API pública do Supabase Auth: ambas passaram em
  login AAL1 somente com senha; código TOTP propositalmente incorreto foi
  recusado sem elevar AAL; código correto elevou cada sessão para AAL2.
- Com JWT de cada conta, a consulta direta da tabela `Workspace` pela Data API
  foi negada, como esperado pelos grants de `public`.
- A API Preview respondeu `/api/v1/health` no navegador autenticado na Vercel.
  O mesmo endpoint via HTTP não autenticado retornou **302** por Deployment
  Protection; não foi gerado link público de bypass nem desabilitada a proteção.
- O verificador completo `verify-live-dev-auth-readonly.ts` permanece **não
  executado** contra a API Preview por essa barreira. Os testes locais da API
  com JWTs assinados já foram executados separadamente.
- As contas foram desconectadas, e os scripts temporários que mantiveram os
  segredos TOTP em memória foram removidos. Nenhuma senha ou semente TOTP foi
  persistida em arquivos ou no Git.

**Alvos exatos da limpeza realizada, exclusivamente Dev:**

| Tipo | Identificador |
| --- | --- |
| Auth e `public.User` Owner | `5115aa96-691d-4e1d-b829-7507bb89857b` |
| Auth e `public.User` Viewer | `94688569-47c0-47b4-bfa5-432f2178b1d9` |
| Espaço compartilhado QA | `76d84687-1c83-44e9-af41-4d95ea25acab` |
| Espaço privado QA | `14f50f51-0163-44b6-adda-b02b117d678f` |

Preflight de exclusão retornou exatamente **2 `public.User`**, **2 `Workspace`**,
**3 `WorkspaceMember`**, **0 vínculos a outros espaços** e **0 lançamentos,
contas mensais ou faturas** nesses espaços. Após a expiração da primeira
confirmação SQL, a nova execução foi aprovada; a operação guardada removeu os
três vínculos, os dois espaços e os dois usuários internos. O painel oficial
de Supabase Auth confirmou a exclusão das duas contas técnicas, sem tocar
em identidades reais. A verificação SQL final retornou **zero** para os
quatro conjuntos: `auth.users`, `public.User`, `public.Workspace` e
`public.WorkspaceMember` (filtrados exclusivamente pelos IDs QA acima).

**Status:** dados QA totalmente removidos do Supabase Dev; resta somente o
teste HTTP Owner/Viewer na API Preview protegida pela Vercel. Para executá-lo,
serão necessárias **novas contas QA** e uma via de acesso à Preview autorizada,
com cleanup após a execução.
