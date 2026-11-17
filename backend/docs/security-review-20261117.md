# Auditoria incremental de segurança — Farol Finanças (17/11/2026)

Escopo: código do backend, metadados do Supabase **Dev** `tvirkrjkgdtybtcundon`
e testes isolados. **Produção não foi modificada.** Nenhum dado pessoal ou
financeiro foi exportado. Este relatório não é certificação de segurança.

## Proteções verificadas

- Doze tabelas financeiras do schema `public` estão com RLS ativo e sem
  privilégios diretos de leitura de `anon` ou `authenticated`; o banco é
  acessado pela API, que valida vínculo com o espaço e papel.
- `public.calendar_events` mantém quatro políticas por `user_id = auth.uid()`.
  Adicionamos no Dev uma quinta política `RESTRICTIVE`, que exige AAL2 caso
  o titular possua TOTP verificado. Sem fator cadastrado, AAL1 permanece válido.
- A função `farol_security_private.current_user_requires_totp()` consulta apenas
  os fatores da própria identidade da sessão, fica em schema não exposto,
  usa `search_path` vazio e nega EXECUTE/USAGE a `anon`.
- A API passou a negar acesso financeiro em AAL1 quando o servidor **não sabe**
  se há autenticador cadastrado. A variante QA somente leitura, que não tem
  privilégio de ler fatores MFA, exige AAL2 incondicionalmente.
- O verificador temporário de Auth-only Dev não interpreta `factors` ausente
  como uma lista vazia.
- O bucket `farol-invoices-private` permanece privado; a tabela de metadados
  de faturas não tem acesso de cliente.

## Testes realizados

- Em Dev, sessão simulada de conta com TOTP: AAL1 negado, AAL2 permitido.
- Em Dev, sessão simulada sem TOTP: AAL1 permitido.
- A política de calendário foi conferida no catálogo PostgreSQL, com
  `AS RESTRICTIVE`, `USING` e `WITH CHECK`.
- Auditoria de ACL da função privada: `authenticated` pode executar, `anon` não.
- Testes de backend, isolamento entre espaços e regressão de permissões;
  testes e build frontend. Resultados devem ser registrados no commit.

## Avisos e pendências

1. O Supabase Security Advisor informa **Leaked Password Protection Disabled**.
   A verificação hospedada de senhas vazadas exige plano Pro; manter o projeto
   gratuito não habilita essa proteção. Isso não substitui boas senhas e TOTP.
2. `public.User` e `public.invoice_documents` têm RLS sem policies de cliente,
   intencionalmente: não são expostas pelo Data API para `anon`/`authenticated`.
3. Dados financeiros legados ainda existem em `localStorage` **sem criptografia
   em repouso**. O vínculo à conta limita a interface, mas não protege contra
   scripts do mesmo origin, extensões maliciosas ou acesso ao perfil do navegador.
   A migração desses dados deve preservar cópias e ser testada antes de limpar.
4. A nova policy de calendário foi aplicada **somente no Supabase Dev**.
   O SQL reprodutível está em `backend/sql/calendar_mfa_restrictive_dev.sql`;
   aplicar em produção requer revisão, janela de migração e testes E2E.
5. Faltam testes E2E reais com autenticador e login no Preview, sem coletar
   senhas/códigos de terceiros.
6. Downloads de faturas permanecem desativados até existir varredura segura de
   malware e autorização ponta a ponta; restauração de backups ainda é pendência.
7. O Security Advisor de performance recomenda avaliar índices para três
   chaves estrangeiras; sem evidência de lentidão, não remover índices existentes.

## Próxima etapa sugerida

Plano de recuperação de dados e atualização segura dos registros legados;
depois validação de todos os fluxos financeiros com Viewer, Editor e Owner
em dados fictícios, sem abrir a produção.
