# Farol Finanças | Integração segura com Supabase Dev (auditoria de metadados)

Data da verificação ao vivo: **10/11/2026**. Não alterou dados de usuários nem estrutura do banco.

## Ambientes conferidos

- **Desenvolvimento:** projeto Supabase `tvirkrjkgdtybtcundon` (Farol Finanças Dev), banco PostgreSQL independente, ativo.
- **Produção:** projeto `xwzbcabyjhmgggbkaxvt` (Farol Finanças), diferente do desenvolvimento; **não utilizado para operações de leitura dos dados nem escrita nesta etapa**.
- O banco Dev **não está vazio**: havia duas contas Auth e dados financeiros de desenvolvimento. Não foram reutilizadas, excluídas, modificadas nem receberam tokens/novas senhas.

## Auditoria live realizada via Supabase Dev, somente SELECT

1. Todas as **13 tabelas públicas** retornaram com RLS habilitada.
2. As **12 tabelas financeiras e de documentos** estavam sem políticas RLS e sem privilégios diretos SELECT/INSERT/UPDATE/DELETE aos papéis `anon` e `authenticated`. Esse comportamento é de negação direta, intencional com a atual API Fastify/Prisma. **Não confere, isoladamente, a segurança da API privilegiada.**
3. `calendar_events` possui quatro políticas por operação (SELECT, INSERT, UPDATE e DELETE) para `authenticated` com predicado de propriedade `auth.uid() = user_id`. INSERT e UPDATE também exigem a restrição de titular no `WITH CHECK`.
4. O Supabase Security Advisor identificou aviso de **proteção contra senhas vazadas desabilitada**. A configuração não foi alterada. Revisar em [Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
5. Avisos informativos de tabelas com RLS sem políticas são esperados para tabelas financeiras acessadas exclusivamente pela API, desde que grants diretos continuem ausentes. Conferir políticas e privilégios em toda mudança.

## Teste real de isolamento com Postgres, sem Dev real

O script `backend/scripts/test-postgres-rls-isolation.ts`:
- Exige `CI=true` e banco local `localhost:5433/farol` com usuário `farol`, recusando Supabase hospedado.
- Insere dados **fictícios**, cria papel temporário não privilegiado e lhe concede apenas SELECT.
- Confirma que o papel temporário, sem política autorizadora, não visualiza registros das tabelas `User`, `Workspace`, `WorkspaceMember` e `Transaction`.
- Sempre executa `ROLLBACK`, inclusive em falhas. O PostgreSQL do GitHub Actions é efêmero.
- Executa automaticamente em cada alteração no CI de validação da branch de segurança, junto dos testes de MFA/isolamento da API.

Esse teste prova negação via RLS no PostgreSQL, mas **não** simula o login real de duas pessoas no Supabase Auth.

## Auditoria recorrente live, preparada mas NÃO ativada

Arquivos:
- `backend/src/infrastructure/security/devPermissionContract.ts`
- `backend/scripts/check-dev-security-readonly.ts`
- `.github/workflows/supabase-dev-readonly-audit.yml`

O workflow está restrito ao branch padrão e possui travas adicionais:
- Somente projeto Dev exato e URL HTTPS `https://tvirkrjkgdtybtcundon.supabase.co`.
- Requer a opção `FAROL_DEV_AUDIT_ENABLED=true` em GitHub Actions Variables.
- Requer ambiente protegido `supabase-dev-readonly` no GitHub Actions e segredo **exclusivo** `FAROL_DEV_READONLY_DATABASE_URL` nesse ambiente.
- Conexão deve usar papel PostgreSQL `farol_audit_ro` sem superusuário nem BYPASSRLS, no host Dev, com `sslmode=verify-full`; o código falha fechado em qualquer outra combinação.
- A sessão SQL é configurada como **READ ONLY**, com `BEGIN TRANSACTION READ ONLY`, e consulta apenas catálogos `pg_class`, `pg_namespace`, `pg_roles`, `pg_policies`; não lê registros de clientes.
- Não executa operações DDL/DML e não inclui `service_role`, chaves ou dados pessoais nos logs.
- Quando devidamente configurado e integrado à branch padrão, pode verificar as permissões **diariamente**, via schedule UTC `11:29`, com disparo manual disponível.

### Como ativar posteriormente

1. Em Supabase **Dev**, providenciar uma identidade PostgreSQL separada `farol_audit_ro` com privilégio de conexão e leitura dos catálogos de sistema, **sem** SELECT/INSERT/UPDATE/DELETE nas tabelas financeiras e sem privilégios de superusuário. Essa criação precisa de revisão/consentimento porque altera permissões do Dev.
2. Configurar TLS de validação completa de certificados e credenciais exclusivas da conta no ambiente protegido `supabase-dev-readonly` do GitHub. **Nunca usar URL de conexão de Prod nem a credencial `postgres`**.
3. Após a revisão, integrar a cadeia de PRs até a branch padrão e definir `FAROL_DEV_AUDIT_ENABLED=true`. Caso contrário, o job permanecerá **ignorado**, o que **não significa saúde aprovada**.
4. Executar o workflow manualmente e confirmar sucesso antes de confiar na periodicidade.

## Limites e próximos passos

- Esta etapa **não criou usuários de teste** no Supabase Dev, pois o projeto possui contas e registros existentes. Não foi realizado um E2E real de cadastro, TOTP ou recuperação de conta.
- Para E2E completo será preciso preparar contas artificiais **específicas de QA** e seus segredos em ambiente separado, sem tocar nos usuários atuais. Esse trabalho só deve começar após garantir isolamento e estratégia de limpeza reversível dos dados de QA.
- A auditoria live de metadados foi realizada via conexão de administração do Supabase, somente com consultas `SELECT`. **Ainda não há verificação diária ativa de Dev**; o CI valida neste momento código e banco efêmero, não a API hospedada.
- Fica pendente a análise de senhas vazadas no Auth (aviso Supabase); não mudar automaticamente a configuração sem análise de impacto nos logins existentes.
