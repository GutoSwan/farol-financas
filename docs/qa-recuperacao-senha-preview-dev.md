# Farol Finanças | Recuperar senha no ambiente de testes

**Ambiente:** Supabase Dev `tvirkrjkgdtybtcundon` e Preview isolada da Vercel.

## Diagnóstico
O login de produção e o login do Supabase Dev são contas independentes, mesmo com o mesmo e-mail. A senha utilizada no Farol principal pode ser diferente.

A conta indicada já existe e tem e-mail confirmado e TOTP verificado no Supabase Dev. Existe um hash de senha no Dev, mas não é possível recuperar uma senha original a partir dele, e ela nunca deve ser solicitada no chat.

A recuperação anterior solicitou envio de e-mail, mas o retorno do link para o domínio Preview depende do **Redirect URL Allow List** do Supabase Auth. O conector atual não permite modificar esse campo diretamente.

## Fluxo corrigido

1. Abra o site Preview Dev e clique em **Esqueci minha senha**.
2. Informe o e-mail da conta Dev, sem enviar senha ou token para ninguém.
3. No Supabase Dev, em **Authentication > URL Configuration > Redirect URLs**, adicione **somente** a URL:
   `https://farol-financas-git-security-v027-auth-only-admin-8d8d01-farol13.vercel.app/redefinir-senha`
4. Clique em salvar. Não é preciso mudar a URL de produção nem a Site URL do projeto Dev.
5. Solicite **outro** e-mail de recuperação e clique no link recebido. Links antigos são de uso único e podem ter sido consumidos.
6. A tela **Definir nova senha** agora abre automaticamente quando a sessão for de recuperação. Escolha sua nova senha do Dev.
7. Após a troca, a sessão temporária é encerrada. Entre com a senha nova e confirme seu autenticador TOTP. O Super Admin ficará acessível só depois da verificação no servidor.

### Alternativa quando o e-mail continua voltando ao endereço errado

Acesse manualmente **/redefinir-senha** no site Preview. Peça outro e-mail de recuperação, use a opção **Copiar endereço do link** no próprio e-mail e cole o endereço na área **Confirmar link de recuperação** do Farol. O aplicativo só aceita links HTTPS originais do **Supabase Dev** e confirma o token diretamente no Supabase, nunca por uma API financeira.

**O link é uma credencial de uso único.** Não encaminhe esse link ao ChatGPT, GitHub ou suporte; cole apenas na página do Farol. Se o link já foi aberto e consumido, solicite outro.

## Garantias de segurança

- Nenhuma senha é gravada no código ou solicitada à equipe de desenvolvimento.
- Tokens colados não ficam guardados no campo, logs ou URL do navegador.
- O link só pode pertencer ao projeto Auth Dev e ser do tipo `recovery`.
- Um usuário com sessão normal não recebe automaticamente acesso à tela de troca de senha sem comprovar a recuperação.
- Após trocar a senha, exige-se novo login e segundo fator para acessar dados.
- Sem alterações no Supabase Production, Auth Production ou banco financeiro.

## Validação

Testes automatizados: domínio estável da Preview, rejeição de host falso/produção, token inválido/duplicado, proteção da sessão de recuperação, URL reescrita da SPA, roteamento do evento `PASSWORD_RECOVERY` e logout ao finalizar.

**Limite dos testes:** a conclusão depende de adicionar o redirect no painel Supabase Dev e clicar no link real do e-mail. A senha e o token do usuário nunca são usados em CI.
