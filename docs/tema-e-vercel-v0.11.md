# Farol v0.11 · Tema da lateral e preparação Vercel Hobby

## Correção do modo claro

O arquivo `src/assets/styles/sidebar-theme.css` é importado **depois** dos CSS anteriores no `src/main.ts`. Assim ele substitui fundos escuros fixados em `global.css` e no drawer mobile sem prejudicar o tema escuro.

- Claro: barra branco-gelo, texto azul-escuro, itens ativos com fundo rosado, ícones bordô, seleção de espaço clara e menu de perfil com fundo branco.
- Escuro: lateral azul-marinho e ícones rosados, como antes.
- Funciona tanto no desktop fixo quanto no menu móvel de três linhas; alternância pelo botão de sol/lua continua persistindo via `useTheme`.
- Teste no Chrome a largura de **892×576** e mobile **390×844**. O modo claro deve clarear inclusive o drawer, o seletor e os popovers.

## Primeira publicação: demonstração estática, NÃO serviço financeiro

A v0.11 **não implanta** nada automaticamente. Foi adicionado `vercel.json` com `framework: vite`, `npm run build`, saída `dist` e rewrites **somente nas rotas do Vue**. Não se cria rewrite genérica que encaminhe `/api` para `index.html` como se fosse JSON.

Em produção, o painel `Minha conexão com a API` exibe um aviso em vez de consultar `localhost`: o Fastify e o PostgreSQL ainda não foram hospedados. Demais dados financeiros continuam exclusivamente no `localStorage` de cada navegador. **Não usar dados financeiros reais no endereço público.**

### Configuração da Vercel

1. Entre em https://vercel.com/ e escolha o plano **Hobby** (uso pessoal não comercial).
2. Vá a **Add New → Project** e conecte sua conta do GitHub. Autorize o repositório `GutoSwan/farol-financas`.
3. Importe esse repositório, projeto `farol-financas`. **Root Directory**: `./` ou raiz do repositório (onde estão `index.html`, `vite.config.ts`, `vercel.json` e `package.json`). **Não use `backend/`.**
4. **Framework Preset**: Vite; **Build Command**: `npm run build`; **Output Directory**: `dist`; **Install Command**: padrão `npm install`.
5. Na primeira demonstração visual, você pode **deixar de configurar as variáveis do Supabase**. O site abrirá, mas a autenticação informará que não está configurada. Assim o endereço público não habilita cadastros por acidente.
6. Quando quiser testar login na Vercel, adicione **somente**:
   - `VITE_SUPABASE_URL` = URL pública `https://...supabase.co` do seu projeto;
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` (chave publicável).
   **Nunca** adicione `DATABASE_URL`, `SUPABASE_SECRET_KEY`, `service_role`, senha SMTP ou chave SMTP no frontend ou no repositório. O Vite incorpora `VITE_*` no bundle público.
7. O GitHub desse projeto contém várias branches com **PRs draft encadeadas** e a branch `main` ainda não reúne todas as mudanças. **Cuidado:** ao importar o repo, a Vercel escolhe `main` como **Production Branch** por padrão. Para visualizar a correção de tema sem mesclar, crie um **Preview Deployment** da branch `feat/v0.11-tema-claro-preparacao-vercel` em **Deployments → Create Deployment** (informe o nome da branch), ou, depois de revisar e mesclar as PRs na ordem, publique a branch de produção. Um deploy padrão do `main` pode exibir uma versão antiga.
8. Confirme no painel de Deployments **qual branch e commit foram usados**. Após o build, abra o endereço gerado pela Vercel; não presumir nome `farol-financas.vercel.app`, pois depende de disponibilidade.

### Rotas e limites

Teste as rotas diretas `/entrar`, `/cadastro`, `/conta`, `/relatorios`: foram adicionados rewrites individuais para `index.html` (SPA com history mode), sem interceptar a API.

A Vercel Hospeda apenas o **frontend** nesse estágio: o `vite.config.ts` tem proxy para `127.0.0.1:3333` que só funciona com `npm run dev`, não no deploy. A v0.11 por padrão desabilita o painel online da demo em produção. Uma futura etapa precisará hospedar Fastify + Postgres, adicionar autorização real para os dados financeiros e configurar a URL HTTPS da API antes de habilitar esse painel.

**Ao habilitar login na Vercel**, acesse Supabase → **Authentication → URL Configuration**. Adicione o endereço HTTPS **efetivo** da implantação em `Site URL` conforme sua estratégia, e liste explicitamente as URLs de redirecionamento, incluindo `https://SEU-ENDERECO.vercel.app/entrar` e `https://SEU-ENDERECO.vercel.app/redefinir-senha`. Mantenha as URLs localhost de desenvolvimento. Sem isso, links de senha e outros fluxos podem abrir a página errada. Para previews, prefira URLs estáveis; URLs aleatórias exigem allowlist bem pensada.

O domínio `.vercel.app` é **para hospedagem web**, não oferece DNS próprio para autenticar remetente `@vercel.app` no Brevo. O SMTP e o template de código `{{ .Token }}` continuam pendentes de configuração no Supabase.

### Referências oficiais

- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/git
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/project-configuration/vercel-json
- https://supabase.com/docs/guides/auth/redirect-urls

### Checklist de verificação

- Alternar tema claro/escuro com a barra no desktop e mobile.
- Abrir popover de espaço e perfil no tema claro.
- Rodar `npm run test` e `npm run build` na raiz.
- Conferir arquivo `vercel.json` e testar acesso direto às páginas do Vue.
- Confirmar que `/api/v1/me` não é reescrito para HTML e que o painel da API não chama backend ausente na demo.
- Fazer o deploy **somente com dados fictícios**.
