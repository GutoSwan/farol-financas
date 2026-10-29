# Farol v0.8: lateral fixa e análise de endereço gratuito

## Navegação lateral

- Desktop (>700 px): a lateral fica **sticky** e ocupa a altura visível da janela. O conteúdo do Dashboard pode rolar independentemente, sem perder o acesso à navegação, seletor de espaços ou perfil.
- A parte de cima contém a marca e a navegação com rolagem própria se a janela for baixa. A parte inferior contém **Espaços financeiros** e **Minha conta**, com uma segunda rolagem interna somente quando necessário.
- Os menus de gerenciamento e perfil abrem como painéis flutuantes para não serem cortados pela área com rolagem. A tecla Tab alcança os links/botões e a navegação de teclado continua disponível.
- Mobile (<=700 px): mantém a organização empilhada, com menu horizontal e seletor de espaços, sem reservar 100% da tela para a lateral.
- Tudo permanece do lado do cliente. Nenhum dado local foi apagado, movido ou exposto.

### Teste manual de rolagem

1. Abra a página `/` com largura maior que 700 px.
2. Role bastante o Dashboard e confira que a lateral continua na tela e que **Espaços financeiros** e **Minha conta** permanecem acessíveis.
3. Troque o espaço selecionado e abra/feche **Gerenciar espaços**. Os painéis não devem ser cortados no canto da tela.
4. Reduza a altura da janela (por exemplo 600 px). Role dentro da lista de navegação, sem deslocar a barra inteira junto com o Dashboard.
5. Reduza a largura para 700 px ou menos: confirme que o menu não ocupa a janela inteira nem bloqueia as funcionalidades.
6. Teste com modo escuro e claro, teclado, cadastro/login e nome longo de espaço.

## Endereço gratuito: escolha técnica

**Cloudflare Pages**, com subdomínio `<nome>.pages.dev`, é a melhor escolha inicial para hospedar o frontend Vue de forma gratuita, com HTTPS. A integração GitHub permite publicação manual ou automatizada, mas **não foi ativada nem implantada nesta versão**.

- É um **subdomínio de hospedagem**, não um domínio registrado e controlado pelo Farol.
- Está sujeito a disponibilidade de nome, limitações do plano gratuito e regras de uso do provedor.
- HTTPS protege o tráfego até a hospedagem; não substitui controles no backend, autorização, isolamento de usuários, backups ou políticas de privacidade.
- A Cloudflare Pages **não hospeda automaticamente nosso Fastify nem PostgreSQL local**. Antes de publicar, é necessário provisionar o backend de forma segura e trocar o proxy de desenvolvimento `/api` por uma conexão HTTPS real com a API; não apontar o navegador para `localhost:3333` do visitante.
- O Vue usa history mode e precisa servir `index.html` em rotas como `/entrar` e `/conta`; o Cloudflare Pages faz o fallback de SPA quando não existe um `404.html` na raiz.
- O build do frontend deve fornecer apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` públicas. Nunca fornecer `service_role`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` nem senha/chave SMTP ao frontend.
- Para autenticação e recuperação de senha, adicionar as URLs `https://<nome>.pages.dev/entrar` e `https://<nome>.pages.dev/redefinir-senha` ao allowlist do Supabase (Site URL correto e Redirect URLs exatas), mantendo `localhost` para desenvolvimento.

### Domínio de envio de e-mails

A hospedagem gratuita `.pages.dev` **não permite que o Farol controle os registros DNS desse domínio** para cadastrar um remetente `contato@farolfinancas.pages.dev` no Brevo.

O Brevo recomenda e exige que a autenticação DKIM/DMARC seja feita em um domínio **próprio que controlamos**, para evitar substituições de remetente e filtros de spam. Não recomendamos domínios gratuitos de procedência duvidosa nem prometer que algum serviço aleatório serve para e-mail de produção.

**Decisão sugerida:** Cloudflare Pages para **homologação do site**, mantendo dados de teste; antes da entrada pública com usuários reais, registrar um domínio próprio com DNS acessível e aplicar as proteções pendentes no backend e na autenticação. Não é necessário comprar domínio para continuar o desenvolvimento local.

### Referências oficiais

- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/configuration/serving-pages/
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://supabase.com/docs/guides/auth/redirect-urls
- https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC
- https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders
