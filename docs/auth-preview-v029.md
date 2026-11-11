# Autenticação no Farol v0.29 (somente ambiente Dev)

A branch `feat/v0.29-admin-standalone-preview` usa Supabase Dev e o endereço estável:
`https://farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app`.

## Pré-requisito no Supabase Dev (não configurar no projeto de produção)

1. Abra o painel do projeto Supabase Dev, **Authentication > URL Configuration**.
2. Em **Redirect URLs**, adicione as duas URLs EXATAS:
   - `https://farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app/confirmar-email`
   - `https://farol-financas-git-feat-v029-admin-standalone-preview-farol13.vercel.app/redefinir-senha`
3. Salve. Não use domínio curinga global e não altere a **Site URL** de produção.
4. Se houver templates de e-mail personalizados, confira se os links usam `{{ .ConfirmationURL }}` ou respeitam `{{ .RedirectTo }}`, não forçam `{{ .SiteURL }}` antiga. Não cole tokens em tickets ou prints.

## Como validar

**Confirmação:** na Preview, abra `/cadastro` e crie uma conta de teste (e-mail que você controla). Quando chegar o e-mail, use o botão de confirmação. A página `/confirmar-email` só mostra "E-mail confirmado!" depois de consultar o Supabase Auth. Se tiver recebido um código numérico no e-mail, pode escolher "Recebi um código numérico" e confirmar na mesma tela de cadastro.

**Recuperação:** em `/recuperar-senha`, informe o e-mail da conta de teste, abra o link recebido, confirme que volta a `/redefinir-senha`. Se houver TOTP cadastrado, o fator precisa ser validado antes da troca da senha. Não envie códigos, senhas ou o link recebido para terceiros.

A validação automatizada cobre rotas e segurança; o envio e clique reais exigem o e-mail de teste e a configuração de Redirect URLs no Supabase Dev.

## Segurança

- O Farol normal NÃO autentica Super Admin, e a Preview não escreve dados financeiros online.
- URLs de recuperação possuem tokens de uso único. Jamais registrar em logs, screenshots ou chats.
- Não ampliar o allowlist para qualquer `*.vercel.app`; use apenas os dois caminhos da branch atual.
