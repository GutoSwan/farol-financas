# Farol Finanças: segurança, privacidade e preparação para LGPD

Estado: arquitetura de referência e checklist de implementação. **Este documento não é uma certificação de conformidade ou auditoria independente.** Não usar dados reais de cartões ou faturas de terceiros até passar pelos testes de isolamento, backups e revisão.

## Escopo confirmado do produto

O Farol é um **organizador financeiro manual**. Não processa pagamentos e não se conecta a bancos, cartões, Open Finance ou instituições financeiras. O usuário registra e atualiza seus próprios valores; o sistema apenas organiza e calcula visualizações.

- Crédito: apelido do cartão, instituição opcional, limite informado manualmente, dia de fechamento, vencimento, fatura por mês, compras informadas manualmente e valor da fatura.
- Débito: apelido do cartão, saldo informado manualmente e histórico de despesas informado manualmente.
- Nunca pedir nem armazenar: **PAN/número completo do cartão, CVV/CVC, PIN/senha bancária, credenciais de internet banking, tokens bancários, dados de tarja/chip, QR de autenticação TOTP**.
- Não afirmar que saldo, fatura ou limite estão atualizados pelo banco; mostrar claramente **"Informado por você"** e a data de atualização.

Com esse desenho, evitamos armazenar dados de autenticação de cartões. Isso reduz muito o escopo de risco, mas **não elimina a natureza pessoal dos hábitos e valores financeiros**.

## Estado verificado em 2026-11-06

- Frontend Vue e PWA exigem sessão Supabase antes da navegação. Uma restrição de rota **não substitui autorização no backend**.
- Backend usa JWT Supabase verificado com JWKS, issuer, audience, exp e assinatura; endpoints `/api/v1/workspaces` agora exigem `aal2` no token assinado. `/api/v1/me` permanece acessível com login para diagnóstico/inscrição do segundo fator.
- O Supabase Auth fornece TOTP via Authenticator. Fluxos de inscrição e confirmação no perfil, desafio após senha para contas inscritas.
- Tabelas de domínio em Supabase principal e Dev: 11 tabelas com RLS ligado, sem políticas, com SELECT e INSERT revogados para `anon` e `authenticated`. São usadas pelo backend Prisma com checagem de associação `WorkspaceMember`; **não liberar acesso direto à Data API** sem modelo de políticas e testes completo.
- **Pendência de correção prioritária no banco principal:** `public._prisma_migrations` sem RLS e com privilégios SELECT/INSERT para `anon` e `authenticated`. Rever grants e RLS em janela controlada, testar migrações Prisma com conexão de manutenção e então conferir advisors novamente. **Não foi alterada automaticamente.**
- Supabase Auth principal: proteção contra senhas vazadas está desabilitada (advisory). Revisar e habilitar no painel.
- Os dados financeiros atuais permanecem no `localStorage`, sem criptografia nem isolamento seguro por usuário. Logout não os remove. **Não migrar nem sincronizar esses dados automaticamente ainda**.
- Backup JSON atual é texto legível. Guardar em local seguro; nunca compartilhar ou publicar arquivo de backup.

## Critérios de autorização antes de sincronizar

1. O usuário e o espaço financeiro são determinados exclusivamente pelo JWT validado e pela tabela de associação no backend. Jamais confiar em `userId`, `workspaceId` ou papel declarados no corpo de requisição.
2. Todas as rotas financeiras, inclusive leitura, exigem `aal2`, e cada operação testa a associação do usuário ao espaço e o papel `OWNER/EDITOR/VIEWER`.
3. Testes de troca de `workspaceId`, `transactionId`, `cardId`, `statementId`, leitura, escrita, exclusão e exportação devem resultar em 403/404 sem detalhes privados quando a conta não pertence ao recurso.
4. Validação estrita de dados, proteção contra IDOR/BOLA, CORS limitado, limites de tamanho e taxa de requisição, tratamento de erros e logs sem payloads financeiros.
5. Criptografia TLS (trânsito), proteção em repouso (infraestrutura) e **criptografia autenticada em nível de campo** para descrição detalhada de faturas/comprovantes quando houver persistência real. Preferir AES-256-GCM com chave gerenciada fora do banco (KMS), nonce novo por registro, versionamento e rotação. Não guardar a chave de criptografia no frontend, Git ou banco junto ao ciphertext.
6. Identificação e bloqueio de dados locais de outros usuários do mesmo dispositivo; migração explícita com backup e conferência de contagens, nunca sobrescrever dados silenciosamente.
7. Fazer testes em ambiente Dev com dados sintéticos antes de liberar produção; revisar privacidade, acessos e recuperação de conta.

## TOTP e recuperação

- TOTP é gratuito no Supabase e funciona com aplicativos Authenticator compatíveis.
- Após o registro do fator, a sessão passa a usar `aal2`, e sessões com senha apenas não podem acessar os endpoints financeiros.
- **Supabase TOTP não oferece códigos de recuperação**: o usuário deve ter outro autenticador/dispositivo cadastrado. Perda total exigirá processo de recuperação de identidade administrado e auditado, não bypass por e-mail sozinho.
- O segredo/QR de TOTP não será persistido pelo Farol, incluído em backups, exibido em logs, enviado a serviços analíticos ou capturado em screenshots.
- Em incidentes, revogar sessões/fatores de modo controlado; acesso a suportes privilegiados não deve ser um atalho de leitura de faturas.

## LGPD: requisitos operacionais que ainda precisam de implementação

- Inventariar dados pessoais tratados, finalidade, necessidade, compartilhamentos, retenção e base legal apropriada, documentando escolhas por finalidade. LGPD não é apenas criptografia.
- Política de privacidade acessível no cadastro; explicar que os saldos e faturas são inseridos manualmente, quais provedores são usados e onde ficam armazenados.
- Processos para atender direitos dos titulares: acesso, correção, portabilidade quando aplicável, eliminação conforme hipóteses legais e contestação; fluxo de exportação e exclusão de conta.
- Política de retenção, descarte e backups criptografados. Auditoria de acesso administrativo sem incluir conteúdo da fatura nos logs.
- Plano de incidentes, monitoramento, tratamento de alertas e comunicação à ANPD/titulares quando exigido.
- Identificar operadores/suboperadores e contratos/termos com Vercel e Supabase; revisar transferência internacional de dados (projeto Auth principal está na região US West).
- Revisão jurídica de bases legais e documentos; revisão técnica independente e testes de invasão antes de abrir cadastro público.

Fontes oficiais:
- ANPD, guia de segurança: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte
- LGPD (Lei 13.709/2018): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- PCI SSC CVV: https://www.pcisecuritystandards.org/faqs/are-merchants-allowed-to-request-card-verification-codes-values-from-cardholders/

## Ordem de execução

1. Revisar e corrigir `_prisma_migrations`/proteção contra senhas vazadas após aprovar a mudança de acesso ao banco.
2. Validar MFA ponta a ponta em navegador novo, PWA e iOS, inclusive restauração de sessão e logout.
3. Corrigir separação dos dados locais por usuário e exportação/backup criptografado.
4. Implementar modelo financeiro online por espaço com testes de autorização negativa.
5. Adicionar cartões **somente visuais/manuais**, e depois faturas e lançamentos, com criptografia de campos conforme risco.
6. Revisão LGPD, segurança ofensiva, observabilidade e procedimentos antes de disponibilizar amplamente.
