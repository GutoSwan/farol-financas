## Farol v0.6: confirmação por código e perfil personalizado

### Alteração obrigatória no Supabase (feita pelo proprietário do projeto)

O frontend usa `supabase.auth.signUp({ email, password, options: { data } })` e, sem sessão, mostra um campo para confirmar o e-mail **sem redirecionar a pessoa para outra página**. Porém, a plataforma precisa enviar o **token numérico**, e não o link padrão.

1. Abra o painel do Supabase no projeto Farol.
2. Vá em **Authentication → Email Templates → Confirm signup** (ou **Authentication → Templates → Confirm signup**, dependendo da interface).
3. Mantenha **Confirm email** habilitado nas configurações do provedor de e-mail.
4. Substitua o corpo do modelo de confirmação por:

```html
<h2>Confirme seu e-mail no Farol Finanças</h2>
<p>Recebemos um pedido de cadastro para {{ .Email }}.</p>
<p>Digite o código abaixo na tela do Farol para confirmar seu e-mail:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;">{{ .Token }}</p>
<p>Se não foi você, ignore este e-mail.</p>
```

5. Assunto sugerido: `Seu código de confirmação do Farol Finanças`. Salve as alterações.
6. **Não** mantenha no template o link `{{ .ConfirmationURL }}`, pois ele levaria o usuário para outro endereço em vez de incentivá-lo a inserir o código.
7. **Não é necessário alterar as JWT Signing Keys**: a chave pública ES256 já atende ao backend.

`{{ .Token }}` é substituído pelo Supabase por um código OTP, e a aplicação valida com `auth.verifyOtp({ email, token, type: 'email' })`. A aplicação aceita códigos numéricos de seis a oito dígitos, dependendo da configuração do Supabase. A opção **Reenviar código** utiliza `auth.resend({ type: 'signup', email })`, sujeita aos limites de envio do serviço.

**Importante:** esses passos **não podem ser automatizados apenas com alterações no repositório GitHub**. É necessário salvar o modelo no painel do Supabase. O modelo de e-mail de **Reset password** não é alterado: a recuperação de senha ainda usa o fluxo de link próprio.

### Teste manual

1. `git fetch origin` e `git switch feat/v0.6-email-otp-perfil`.
2. Mantenha `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; na raiz, execute `npm install`, `npm run dev`.
3. Em `http://localhost:5173/cadastro`, informe **nome, e-mail válido e senha** de uma conta nova.
4. Após clicar em **Criar conta e receber código**, a mesma tela mostra um campo para digitar o código; não é necessário abrir links.
5. Digite o código do e-mail e clique em **Confirmar e-mail**. Veja a confirmação de sucesso **na mesma página**.
6. Clique em **Personalizar meu perfil**, escolha um dos ícones e edite o nome. As alterações são gravadas em `Supabase Auth > user_metadata`.
7. Volte à Visão geral: o **nome e o avatar aparecem no canto inferior esquerdo**, abaixo da seção de espaços financeiros. Clique no perfil para editar ou sair.
8. Teste o login após sair e confirme que as configurações do perfil foram recuperadas. Ao entrar/sair, dados financeiros locais não devem ser apagados.

Caso já tenha confirmado o e-mail pelo link antigo, use essa mesma conta no login e edite o perfil; para testar um novo fluxo OTP, cadastre **outro endereço de e-mail seu**. Não é necessário excluir usuários existentes.

### Segurança e limitações

Esta versão **não transforma os dados locais em privados**. Os dados financeiros continuam no `localStorage`, compartilhados no mesmo perfil do navegador. Somente **nome e ícone** são persistidos no `user_metadata` do Supabase. Ícones são vetoriais predefinidos; não há upload de fotos, backend de avatar, autenticação obrigatória no Dashboard nem sincronização de espaços/lançamentos.

A senha é gerenciada pelo Supabase, sem armazenamento no código do Farol. Nunca compartilhe com outras pessoas o código recebido por e-mail. O template com `{{ .Token }}` deve ser editado exclusivamente no painel autorizado do seu projeto.

### Referências

- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/reference/javascript/auth-resend
- https://supabase.com/docs/reference/javascript/auth-updateuser
