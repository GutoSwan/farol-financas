# Preparação de login, cadastro e recuperação por celular

**Projeto:** Farol Finanças  
**Branch:** `security/v0.14-auth-hardening`  
**Ativação em produção:** NÃO autorizada / NÃO realizada

## O que foi desenvolvido

- `/entrar/celular`: login com número brasileiro verificado + código SMS.
- `/cadastro/celular`: cadastro por código SMS. No cadastro, o Supabase poderá
  criar uma conta; no login e na recuperação isso **não acontece**.
- `/recuperar-celular`: reentrada sem senha por SMS em número já associado à
  conta. **Não redefine senha nem remove o TOTP.**
- `/conta`: Vincular ou atualizar celular **após login e MFA AAL2**; o
  Supabase envia SMS e vincula apenas depois do `verifyOtp(phone_change)`.
- `/cadastro`: ajuda para quem já possui conta, sem consultar ou revelar
  publicamente se um endereço de e-mail está cadastrado.
- Página de acesso: UI para escolher e-mail ou celular, tema claro/escuro,
  botões bordô, mobile responsivo e nome `Novo espaço`.

O recurso SMS está **desligado por padrão** via `VITE_ENABLE_PHONE_AUTH`;
não ligar só para mostrar a interface.

## Checklist para ativação futura, somente no Supabase Dev

1. Em Authentication → Providers → Phone, habilitar Phone e configurar
   provedor SMS suportado. **Pode haver cobrança por mensagem**; verificar
   custos, país permitido e estimativa antes de contratar.
2. Definir rate limits/cotas, proteção contra abuso, CAPTCHA e monitoramento
   de envios. Evitar SMS premium/estrangeiro; restringir países se possível.
3. Usar números controlados de QA ou números de teste autorizados no Dev.
4. Conferir fluxo de signup, OTP expirado, reenvio, celular já cadastrado,
   mudança de número, roubo/troca de chip e telefone reciclado.
5. Vincular celular existente apenas com sessão AAL2 e confirmar com código
   `phone_change`. Nunca criar nova identidade para "vincular" número a
   uma conta existente.
6. Depois que o provedor estiver funcional, configurar **somente no frontend
   Preview** `VITE_ENABLE_PHONE_AUTH=true` com branch restrita e executar
   CI/inspeção de deploy.
7. Conferir autenticação do usuário na API e exigência de TOTP. Somente SMS
   (AAL1) **não** abre finanças. Remoção/perda de TOTP existente permanece
   processo de recuperação administrativa, não SMS.
8. Confirmar links e textos de privacidade/LGPD, retenção mínima, vedação de
   logs com número completo/OTP, termos de tratamento do provedor e canais
   para correção/exclusão de dados pessoais.
9. Fazer rollout monitorado e decidir sobre a migração à produção apenas
   quando o checklist e os testes E2E estiverem completos.

## Limitações intencionais

- Não há SMS real até um provedor ser habilitado.
- A recuperação por SMS permite **login em conta com celular já verificado**.
  Não serve como recuperação de um fator TOTP perdido e não garante
  propriedade caso o número tenha sido reciclado.
- Uma conta criada originalmente por e-mail precisa entrar com e-mail +
  senha + TOTP para associar o telefone. Cadastro por SMS sem vincular
  pode criar uma identidade nova e distinta; não é migração nem fusão.
- Senha esquecida ainda pode ser recuperada pelo e-mail verificado.
  Recuperação por telefone não efetua redefinição de senha sem MFA.
- Não guardar códigos SMS nem chaves TOTP em localStorage/logs.
- Nenhum dado financeiro real e nenhuma gravação financeira habilitados
  antes do encerramento da auditoria de segurança.

Documentação oficial:
- https://supabase.com/docs/guides/auth/phone-login
- https://supabase.com/docs/reference/javascript/auth-signinwithotp
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/auth/auth-mfa
