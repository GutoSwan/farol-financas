# Farol Finanças | Auditoria de segurança, 09/11/2026

## Escopo e metodologia

Inspeção do repositório `GutoSwan/farol-financas`, branch `security/v0.14-auth-hardening`, com foco em autorização HTTP, Supabase Auth/MFA, PostgreSQL/RLS, dados locais, arquivos, Vercel Preview e cadeia de dependências. Consultas **somente leitura** aos projetos Supabase `Farol Finanças` e `Farol Finanças Dev`. Nenhum segredo foi exibido e nenhum dado financeiro foi modificado.

Esta análise combina revisão manual do código, Security Advisors do Supabase e pipeline de auditoria de dependências do GitHub. **Não é pentest externo**, e aprovação do CI não constitui prova de ausência de vulnerabilidades.

## Achados confirmados

### ALTO: tabela interna Prisma exposta no Supabase de produção

**Evidência técnica:** `public._prisma_migrations` existia com `relrowsecurity=false`, e `has_table_privilege('anon', oid, 'SELECT'|'INSERT'|'UPDATE')` retornava `true`. O papel `authenticated` também possuía SELECT. O Security Advisor de produção reportou `rls_disabled_in_public` em 09/11/2026.

**Impacto:** a tabela pode ser lida ou alterada pela Data API com papéis públicos caso exposta, ameaçando a integridade e o sigilo do histórico de migrações. Isso **não prova** comprometimento ou acesso a faturas/lançamentos financeiros. Nas demais tabelas financeiras observadas, RLS estava ativa e não havia grants diretos aos papéis públicos inspecionados.

**Correção preparada, mas NÃO executada em produção:** `backend/sql/reviewed_prisma_migrations_lockdown.sql` revoga todos os grants de PUBLIC, anon e authenticated, habilita RLS e deixa a tabela sem policy cliente. Antes da aplicação, confirmar backup, role usada pelo Prisma e conexão administrativa; depois testar que as operações de cliente retornam negado e que `prisma migrate status` funciona na conta administrativa. Não rodar `prisma migrate deploy` sem revisão das migrações pendentes.

A verificação `backend/scripts/check-rls.ts` agora identifica qualquer grant público na tabela interna Prisma, independentemente da configuração de RLS. Os testes rodam em PostgreSQL temporário do CI e não alteram produção.

Fontes: https://supabase.com/docs/guides/database/postgres/row-level-security e https://supabase.com/docs/guides/api/securing-your-api.

### MÉDIO: proteção contra senhas vazadas desabilitada

Os dois projetos Supabase retornaram `auth_leaked_password_protection` (WARN). Recomenda-se habilitar no painel Authentication conforme disponibilidade e plano, sem diminuir as exigências de MFA. Essa opção não é configurável por mera mudança de frontend.

Fonte: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Riscos residuais identificados na revisão

### ALTO para adoção com dados sensíveis: persistência financeira legada em plaintext

`BrowserBillRepository`, `BrowserTransactionRepository` e similares ainda usam `localStorage`. `legacyAccess.ts` verifica vínculo por usuário, mas **não é isolamento criptográfico**: scripts originados no mesmo site ou acesso ao perfil local do navegador podem ler os dados. A interface controla acesso e confirma login, porém dados antigos não são automaticamente migrados para isolamento no servidor. Recomendação: concluir migração com autorização no backend e plano de backup/remoção local explícito, antes de cadastrar dados de cartão reais.

### CORRIGIDO NO CÓDIGO: instalações npm reproduzíveis

Os arquivos `package-lock.json` e `backend/package-lock.json` foram gerados pelo GitHub Actions na branch de segurança e versionados, e os pipelines de segurança, validação, iOS e Android utilizam `npm ci`. O workflow temporário com permissão de escrita foi excluído após a geração. As dependências mantêm alguns intervalos semver no `package.json`, mas a instalação CI respeita as versões do lockfile. Ao incorporar o plugin de notificações do Calendário (PR #20), atualizar o lockfile antes de mesclar.

### IMPLEMENTADO NO CÓDIGO: validação de sessões JWT revogadas

O backend continua verificando `jwtVerify` com JWKS, emissor, público-alvo e AAL. Agora também exige claim `session_id` UUID, role `authenticated`, rejeita `is_anonymous=true` e consulta `auth.sessions` associada a `auth.users` para confirmar usuário, sessão e `not_after` antes de permitir acesso. A consulta é parametrizada e realizada exclusivamente no servidor; erros do banco falham fechados. Foram acrescentados testes de sessão válida, revogada, claims inválidas e indisponibilidade.

O SQL de verificação foi executado **somente para leitura**, com UUID fictício, nos dois ambientes Supabase e não apresentou erro de esquema. No CI frontend e backend os testes passaram. Ainda falta teste E2E com token real em ambiente Dev, incluindo logout, remoção de fator e revogação de sessão. O endpoint `/health` continua independente do banco; APIs autenticadas passam a depender de Postgres para cada requisição, com impacto potencial em latência e disponibilidade.

### Observações de boas práticas já existentes

- Autorização na API baseada em JWT verificado e membership de workspace; leitura financeira exige AAL2.
- Mutação de dados financeiros valida esquema Zod, papel OWNER/EDITOR e `If-Match` para edições concorrentes.
- Faturas armazenadas com criptografia autenticada no servidor e marcadas como quarentena até varredura; nenhuma abertura de PDF foi habilitada.
- A API possui CORS restrito e respostas autenticadas com `Cache-Control: no-store`; o Service Worker só deve cachear recursos públicos.
- No Supabase Dev, `public.calendar_events` tinha RLS e quatro policies por `auth.uid() = user_id` no momento da inspeção.
- Credenciais de servidor permanecem apenas no backend nos arquivos verificados; não se conclui inexistência de segredos em todo o histórico de commits.

## Verificação e testes

- A auditoria GitHub `Farol security audit` rodou frontend/backend com `npm audit --audit-level=high`, verificação de tipos frontend e testes e concluiu com sucesso na PR de calendário auditada.
- As verificações de Banco são estáticas + consulta SQL de grants. **Não houve pentest externo ou teste ativo de exploração.**
- Executar novamente: `npm test && npm run typecheck && npm run build` (frontend), `cd backend && npm test && npm run build`.
- Executar scanner e Security Advisors após correções; validar isolamento usando duas contas de **teste**, nunca acessar dados reais de outro usuário.
- Após correção de metadata em produção: reconsultar `pg_class.relrowsecurity` e `has_table_privilege`, rodar Security Advisors, verificar logs e relatório da migração.

## Go/no-go para produção

Não liberar informações reais de cartão e não mesclar correções do calendário em produção até (1) corrigir grants em `_prisma_migrations` e verificar, (2) encerrar testes de isolamento e tratamento de dados financeiros locais, (3) testar revogação com tokens e contas de teste no Supabase Dev, (4) testar no iPhone real, (5) validar o novo esquema e RLS para calendário de produção antes de qualquer migração.

## Validação posterior das mudanças no código

- GitHub Actions `Farol security audit`: scanner estático, `npm audit` com nível ALTO/CRÍTICO, typecheck e testes de frontend/backend concluídos com sucesso.
- GitHub Actions `Validar Farol Finanças`: build frontend e backend, migrações em PostgreSQL temporário e verificação de RLS concluídos com sucesso.
- O SQL de mitigação de `_prisma_migrations` **não foi executado no Supabase de produção**.
- O armazenamento financeiro local permanece não criptografado; não apagar dados nem migrá-los sem backup explícito e etapa de consentimento.
