# Validação da integração online (v0.14)

## Situação em 2026-11-07
- A rota /dados-online usa somente GET e não sincroniza nem modifica registros locais.
- A interface lista espaços online após checar /api/v1/me e permite consultar até 50 registros por módulo.
- Cliente de leitura confere identidade do Supabase, usa Bearer e no-store e rejeita registros de workspace diferente do solicitado.
- Testes de contrato de resposta e isolamento adicionados em tests/onlineFinance.test.ts.
- Supabase Dev: 0 usuários, 0 espaços, 0 eventos. As quatro políticas de calendar_events estão presentes, RLS ativo e anon sem SELECT.
- Teste E2E com duas contas reais ainda não executado.
- **A nova interface ainda não teve seu build validado**: limite diário de deployments atingido na Vercel (HTTP 402, api-deployments-free-per-day).
- A URL da API não foi configurada nesta branch por falta de confirmação de que o backend Preview acessa exclusivamente o banco Dev. Não apontar automaticamente para produção.

## Pré-requisitos para liberar testes integrados
1. Criar ambiente de teste da API com DATABASE_URL e SUPABASE_URL do Supabase Dev, com segredos inseridos via Vercel sem divulgação em chats/logs.
2. Restringir CORS_ORIGIN ao alias HTTPS do Preview de frontend, sem aceitar curingas.
3. Configurar VITE_API_BASE_URL na mesma branch apontando para o alias HTTPS do Preview de API; verificar ambos com /api/v1/health e /api/v1/me.
4. Executar build e testes do frontend com npm test e vue-tsc, inclusive tests/onlineFinance.test.ts.
5. Criar duas contas de teste via fluxo normal do aplicativo, sem senhas/OTP em tickets ou relatórios.
6. Em Dev, testar espaços distintos para A e B, leitura como OWNER/EDITOR/VIEWER, e requisições com UUID alheio.
7. Comprovar que POST/PATCH/DELETE são bloqueados no Preview e que falhas 401/403/404 não revelam conteúdo financeiro.
8. Confirmar que logout e login de outra conta não exibem informações privadas do primeiro usuário.

## Bloqueio prioritário: dados locais
As telas financeiras antigas ainda usam Browser*Repository e espaços no armazenamento local do navegador, que não estão automaticamente vinculados ao usuário Supabase.
Antes de liberar o Farol a outras pessoas ou permitir faturas reais, implementar separação por usuário, migração segura com backup e tratamento de dados ao sair/trocar contas.
**Não apagar nem migrar dados automaticamente sem plano de rollback.**
