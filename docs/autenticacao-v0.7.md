# Farol v0.7 · autenticação e primeiros espaços online

A v0.7 liga a **sessão do Supabase Auth** à API **Fastify**, com verificação do JWT no servidor e gerenciamento inicial de espaços persistidos no PostgreSQL.

> **Importante:** os espaços online ainda NÃO aparecem no menu de espaços financeiros do Dashboard. São independentes dos espaços locais e estão disponíveis apenas na tela **Meu perfil** até criarmos a migração segura. Entrar no Farol continua **não protegendo** os dados mantidos no `localStorage` do navegador.

## 1. Preparar os serviços no Windows

Na raiz do repositório:

```powershell
git fetch origin
git switch feat/v0.7-auth-api-espacos-online
git pull
npm install
npm run dev
```

Em **outro terminal**, na pasta `backend`:

```powershell
cd backend
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run dev
```

Se as migrações já foram criadas/aplicadas, o Prisma não precisa criar uma nova migração com o mesmo nome. O objetivo é garantir que o PostgreSQL possui as tabelas do `schema.prisma`. Revise as alterações SQL antes de aplicar em bancos com dados existentes.

Configure `.env.local` **na raiz** com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; configure `backend/.env` com `SUPABASE_URL` (a **mesma URL**) e `DATABASE_URL` para o PostgreSQL Docker. Nunca compartilhe senhas, tokens, chaves SMTP, service role ou dados bancários.

## 2. Confirmar cadastro por código (Supabase + Brevo)

O Supabase usa o modelo **Confirm signup** para enviar um e-mail no momento do cadastro.

Se a seção **Authentication → Email Templates → Confirm signup** estiver bloqueada com **Set up custom SMTP to edit templates**, configure primeiro o Brevo:

1. No Brevo, vá a **Settings → Senders, Domains, IPs → Senders** e cadastre um e-mail remetente que você **controla**. Confirme o código de verificação enviado ao remetente. Sem domínio próprio, o Brevo pode substituir o endereço de envio para cumprir regras de autenticação e a entrega pode ser menos confiável.
2. No Brevo, abra **SMTP & API → SMTP** e obtenha o **login SMTP**, o endereço `smtp-relay.brevo.com` e crie uma **chave SMTP**. Salve a chave com segurança. O login SMTP não é o endereço do remetente, e a chave SMTP não é a senha do site Brevo.
3. No Supabase, abra **Authentication → SMTP Settings**, ative **Custom SMTP** e informe:
   - Sender name: `Farol Finanças`
   - Sender email: **seu remetente verificado no Brevo**
   - Host: `smtp-relay.brevo.com`
   - Port: `587`
   - Username: **login SMTP Brevo**
   - Password: **chave SMTP gerada no Brevo**
4. Salve e teste com um endereço de e-mail seu. Se os envios forem rejeitados, confira remetente verificado, restrições da conta Brevo, spam e limites de envio.
5. Volte a **Authentication → Email Templates → Confirm signup** e substitua o conteúdo por:

```html
<h2>Confirme seu cadastro no Farol Finanças</h2>
<p>Digite este código no formulário de cadastro:</p>
<h1>{{ .Token }}</h1>
<p>Se não solicitou o cadastro, ignore este e-mail.</p>
```

6. Salve. Sem `{{ .ConfirmationURL }}` no e-mail, o usuário pode **digitar o código na mesma tela**, sem abrir links.

**Não desative a confirmação de e-mail para contornar limites de SMTP.** Para publicar o Farol, use um domínio de envio próprio com DKIM, SPF e DMARC, além de HTTPS no site e configurações de segurança revisadas.

Referências:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp
- https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email
- https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders

## 3. Testar login e identidade na API

Acesse `http://localhost:5173/entrar`, entre com sua conta Supabase confirmada e depois vá a `http://localhost:5173/conta`.

O painel **Minha conexão com a API** executa dois testes:

- `GET /api/v1/me`: o Fastify devolve o identificador do usuário **obtido do JWT verificado no servidor** (não de um parâmetro no navegador).
- `GET /api/v1/workspaces`: devolve apenas os espaços que o usuário tem permissão de visualizar no banco.

Se você vir **Identidade validada** e nenhum espaço online, isso é esperado: os espaços locais ainda não foram migrados. Use **Criar espaço online vazio** para criar um teste. A API usa `POST /api/v1/workspaces` e grava o usuário como **OWNER** do novo espaço, sem copiar dados financeiros locais.

**Atenção:** não crie o mesmo espaço repetidas vezes só para testar. Nesta etapa, a API ainda não tem um mecanismo para excluir espaços online nem para migrar o conteúdo local. Os espaços de teste podem ser tratados depois.

Para testar isolamento, entre com **outro usuário Supabase**: a lista de espaços online deve ficar vazia, até ele criar ou receber acesso autorizado. O servidor nunca retorna os espaços do primeiro usuário com o JWT do segundo.

## Próximas etapas

- Concluir o fluxo de autenticação real (login, confirmação OTP, recuperação de senha e perfil).
- Configurar convites/membros dos espaços online e regras de autorização no backend.
- Implementar APIs financeiras e uma **importação assistida** dos dados em `localStorage` para o PostgreSQL, com exportação de segurança, prevenção de duplicação e verificação de permissões.
- Somente então tornar o login obrigatório no Dashboard e substituir os espaços locais por espaços online.

### Verificar sem iniciar a interface

O GitHub Actions roda `npm run test` e `npm run build` na raiz e no backend, além de `prisma validate`. Os testes não substituem uma verificação real de envio de e-mail nem de login em seu projeto Supabase.
