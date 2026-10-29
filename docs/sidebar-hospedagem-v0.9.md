# Farol v0.9: lateral organizada e decisão de hospedagem pessoal

## Por que a lateral tinha duas rolagens

Na v0.8, a lista de links e a seção inferior da barra tinham `overflow-y: auto`. Em janelas baixas, cada região exibia uma barra interna e escondia partes da navegação, dos espaços e do perfil.

## Como funciona a v0.9

- A barra continua visível enquanto a página principal rola, usando `position: sticky`, sem rolagens internas no menu.
- Marca e links no topo; **Seus espaços** e **Perfil** no rodapé.
- O seletor já mostra o nome do espaço atual, por isso removemos o nome duplicado.
- O botão de convite desabilitado e a legenda `Protótipo · dados locais` saíram da barra. O aviso sobre dados locais permanece no gerenciamento de espaços e na página Minha conta.
- **Com altura suficiente**, todas as sete páginas aparecem diretamente.
- **Com altura até 690px**, Visão geral, Contas mensais, Gastos fixos e Lançamentos ficam visíveis. O botão **Mais páginas** abre Cartões de crédito, Orçamentos e Relatórios num menu flutuante, sem rolar a lateral.
- Com altura muito reduzida, o layout comprime espaços e perfil adicionalmente.
- No celular, a barra vira uma seção estática com links que quebram linha e seletor de espaço.
- Os menus flutuantes podem ter sua própria rolagem se contiverem muitos espaços, mas **a barra lateral fechada não tem barras internas**.

## Teste visual recomendado

1. No desktop, abra uma página longa (`/lancamentos` ou `/relatorios`) e role o conteúdo. A barra fica visível e o seletor de espaços não desaparece.
2. Redimensione a altura da janela para aproximadamente **570px**, como no print original. Não devem aparecer duas barras de rolagem laterais; deve surgir **Mais páginas**.
3. Clique em Mais páginas e confira as três rotas e o fechamento ao selecionar uma delas ou pressionar Esc.
4. Alterne e gerencie espaços; veja o aviso sobre dados locais. O painel de gerenciamento é flutuante.
5. Verifique o perfil no rodapé e o menu de opções, nos temas claro e escuro.
6. Reduza a janela para <=700px de largura; confira que nenhum menu fica escondido em uma barra lateral de 100vh.
7. Revise a acessibilidade por teclado e a tela com zoom de navegador 125-200%.

## Cloudflare Pages ou Vercel?

**Decisão para a fase atual: Vercel Hobby**. O Farol ainda é um projeto **pessoal, sem uso comercial**. Por isso o plano Hobby, que oferece domínio `<nome>.vercel.app`, HTTPS, integração GitHub, previews de mudanças e implantação gratuita do frontend estático, atende bem a testes e compartilhamento privado de demonstrações.

A alternativa **Cloudflare Pages** também é confiável e oferece endereço `<nome>.pages.dev`, HTTPS e integração Git. Não existe garantia de nome livre em nenhuma das plataformas.

### Limites importantes antes de publicar

- Vercel Hobby permite **somente uso pessoal não comercial**. Se esse contexto mudar, será preciso reavaliar o plano.
- O repositório atual contém um **frontend Vue/Vite**, um **Fastify com Prisma** e PostgreSQL **local**. Publicar o frontend na Vercel **não publica** o backend nem o banco: a área `/conta` mostrará erro da API sem infraestrutura online segura.
- `.vercel.app` é domínio compartilhado de hospedagem, não um domínio DNS próprio para autenticar remetente no Brevo (DKIM/DMARC). **Não use um endereço de e-mail de remetente inventado sob `vercel.app`.**
- Não armazene ou publique `SUPABASE_SECRET_KEY`, `service_role`, `DATABASE_URL`, chaves SMTP ou tokens no frontend. Variáveis `VITE_*` são públicas no bundle.
- Todos os dados financeiros que ainda estão em `localStorage` **não estão isolados por usuário**; não convide pessoas reais a cadastrar dados financeiros nesse estágio.
- Quando o site estiver pronto para publicação, será necessário revisar configuração de **SPA rewrite** (para `/entrar` e `/conta`) e não reescrever solicitações `/api` como HTML; configurar a URL de produção no allowlist de redirecionamento do Supabase; e hospedar o backend com HTTPS e DB persistente.
- **Nenhum deploy foi executado** nesta etapa; a escolha da Vercel é planejamento, não conclusão de hospedagem.

### Fontes oficiais

- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/plans
- https://vercel.com/docs/frameworks/frontend/vite
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/pages/platform/limits/
- https://supabase.com/docs/guides/auth/redirect-urls
