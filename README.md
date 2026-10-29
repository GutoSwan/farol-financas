# Farol Finanças

Projeto de controle financeiro web, iniciado do zero em **Vue 3 + TypeScript + Vite**.

## Executar no computador

Requisitos: Node.js moderno e npm.

```bash
npm install
npm run dev
```

Abra o endereço apresentado no terminal (geralmente http://localhost:5173).

```bash
npm run typecheck
npm run test
npm run build
```

## Arquitetura

- `src/assets`: CSS e futuros recursos visuais.
- `src/domain/entities`: entidades do negócio.
- `src/domain/value-objects`: regras de representação monetária em centavos.
- `src/domain/repositories`: contratos de armazenamento.
- `src/domain/services`: cálculos puros para valores mensais e variação.
- `src/application/use-cases`: criar contas e registrar valores mensais.
- `src/infrastructure/persistence`: implementação local provisória.
- `src/presentation`: telas, componentes, layout e composables Vue.
- `src/router`: rotas da aplicação.
- `src/shared`: utilitários genéricos.
- `tests`: testes de regras financeiras.

## Escopo inicial

1. Dashboard de contas mensais.
2. Cadastro de contas recorrentes (nome e vencimento).
3. Registro do valor de cada mês, com situação pago/pendente.
4. Comparação com o registro anterior e histórico.
5. Páginas reservadas para lançamentos, cartões, orçamentos e relatórios.

**Importante:** o cadastro da conta não guarda um valor fixo. Cada `MonthlyBillEntry` guarda um valor de um mês específico, evitando sobrescrever o histórico.

## Limitações

Esta versão é **um protótipo de desenvolvimento**. Os dados ficam no `localStorage` do navegador, sem login, servidor, backup automático ou sincronização. Eles podem ser perdidos ao limpar o navegador. Não utilize dados financeiros sensíveis nem reais até implementarmos persistência segura.

O painel não representa saldo bancário, e marcar uma conta como paga não efetua pagamento.

## Plano

Implementar lançamentos, contas bancárias e cartões com prevenção de dupla contagem; depois relatórios, orçamentos, autenticação, banco e aplicativo mobile.

**Status da validação:** arquivos publicados como proposta; build e testes devem ser executados no ambiente de desenvolvimento antes de mesclar a PR.

## Aparência e espaços financeiros (protótipo)

- O ícone de sol/lua no cabeçalho alterna entre modo claro e escuro. A preferência é guardada no navegador.
- O seletor do cabeçalho alterna entre espaços financeiros locais, começando por **Gustavo e Ana**.
- **+ Espaço** cria outro ambiente de dados no mesmo navegador, como “Finanças do João”. Cada espaço possui seu próprio cadastro e histórico de contas mensais.
- O espaço padrão continua lendo a chave de armazenamento antiga `farol-financas:dev:v1`; os registros anteriores não são apagados.

**Atenção à privacidade:** espaços locais não são contas de usuário. Qualquer pessoa com acesso ao mesmo navegador pode selecionar outro espaço, e espaços de outro computador/celular não ficam sincronizados. Para permitir que um amigo crie login próprio e acesse o Farol em qualquer dispositivo, será necessário implementar autenticação e um backend com autorização por espaço (ex.: usuários, membros e permissões protegidos por RLS no banco).

### Validação rápida

1. Rode `npm install`, `npm run typecheck`, `npm run test` e `npm run build`.
2. Confirme que sol/lua troca o tema sem afetar os valores e que a preferência permanece após recarregar.
3. Cadastre uma conta no espaço “Gustavo e Ana” e outra em um novo espaço.
4. Troque entre eles; as contas devem aparecer apenas no espaço correspondente.
5. Recarregue a página e verifique se o espaço ativo e o tema foram mantidos.


## Lançamentos avulsos, planilha e gráficos

Acesse **Lançamentos** para registrar compras, despesas e receitas que não são contas recorrentes.

Exemplo:
- Descrição: `Compra no mercado`
- Valor: `90,00`
- Tipo: `Despesa`
- Categoria: `Mercado`
- Data: escolha o dia da compra

A mesma tela exibe:
- Resumo do mês com entradas e saídas avulsas.
- Gráfico de despesas por categoria.
- Evolução dos gastos avulsos nos seis meses anteriores, incluindo o mês escolhido.
- Tabela mensal com opções de editar e excluir lançamentos.

O Dashboard também mostra um gráfico e um resumo dos lançamentos avulsos, **separadamente das contas mensais**. Por enquanto, despesas avulsas não são pagamentos de contas recorrentes nem compras parceladas/cartão.

### Navegação e tema

O seletor de espaço, botão “+ Novo espaço” e o recurso futuro de adicionar pessoas ficam na parte inferior da barra lateral esquerda. O botão sol/lua permanece no cabeçalho.

### Teste manual

1. Acesse **Lançamentos** e cadastre “Compra no mercado” por `90,00`.
2. Confira se a categoria Mercado apareceu no gráfico e se a linha apareceu na tabela.
3. Cadastre outro gasto de categoria diferente, altere um valor usando **Editar** e confira o recálculo.
4. Troque o mês e o espaço financeiro, verificando que os registros não aparecem no local errado.
5. No terminal, execute `npm run test` e `npm run build`. A rotina do GitHub Actions também tentará validá-los automaticamente quando estiver habilitada.

## Atualização: categorias personalizadas, reais e gastos totais

- Em **Lançamentos**, o campo Categoria agora aceita texto livre (ex.: `Pets`, `Ração`, `Presentes`) e mostra sugestões de categorias existentes. Diferenças de maiúsculas/minúsculas são normalizadas no cadastro.
- O valor é formatado em reais durante a digitação. Ao escrever `500`, aparece `R$ 500`; ao sair do campo, `R$ 500,00`. Para centavos, use vírgula: `500,50`. A formatação também está disponível em **Contas mensais**.
- Na **Visão Geral**, o destaque passou a ser **Gastos totais**, somando contas mensais registradas (pagas e pendentes) com despesas avulsas. O gráfico mostra seis meses e separa visualmente as duas origens do valor.
- As receitas ficam fora do somatório dos gastos. Uma conta recorrente lançada novamente como despesa avulsa será contada duas vezes, por isso não duplique o cadastro.
- A soma inclui valores pendentes: não é um extrato bancário, nem indica o valor já efetivamente pago.

Para validar:

```bash
npm run test
npm run build
npm run dev
```

Teste manual: registre uma despesa de `500` na categoria personalizada `Pets`, registre uma conta mensal de `200` e confirme **R$ 700,00** em Gastos totais (no mesmo mês e espaço).

## Contas mensais, gastos fixos e relatórios

### Três tipos de despesas

- **Contas mensais**: água, energia e outras despesas cujo valor muda a cada mês. O cadastro permanece, e o valor é registrado em cada mês.
- **Gastos fixos**: aluguel, Netflix, academia e serviços com valor recorrente. Cadastre o valor, vencimento e mês inicial uma vez. O custo passa a aparecer automaticamente nos meses em que a cobrança estiver ativa. Marcar como pago só altera o status do mês, sem duplicar a despesa. O botão **Encerrar** mantém o histórico até o mês selecionado, sem projetar cobranças a partir do mês seguinte.
- **Lançamentos**: compras avulsas, como mercado, combustível e farmácia, e também receitas.

Cada despesa deve ser cadastrada em **um único módulo** para evitar dupla contagem.

### Exclusão de registro no histórico

Na tela de **Contas mensais**, cada linha do histórico tem uma lixeira vermelha. Ela pede confirmação e remove **somente o registro daquele mês**, preservando o cadastro e todos os outros períodos. A exclusão do protótipo é definitiva, sem lixeira de recuperação.

### Relatórios

A aba **Relatórios** agora concentra o gráfico geral de 12 meses, a composição dos gastos (contas mensais, gastos fixos e avulsos), despesas por categoria e uma tabela comparativa. A **Visão Geral** foi simplificada para destacar o total, três subtotais e cobranças pendentes.

As contas mensais pendentes e os gastos fixos previstos entram em **gastos totais**. Portanto, este valor representa despesas e compromissos registrados, **não** exclusivamente dinheiro que saiu do banco.

### Testar

```bash
git pull
npm run test
npm run build
npm run dev
```

Verifique: exclusão de um mês, cobranças fixas recorrentes, mudança de espaço financeiro e totais em Relatórios.

## Versão 0.2: gerenciamento e identidade visual

### Contas mensais

- Cada cadastro apresenta botões de **editar**, **arquivar/reativar** e **excluir** (ícones consistentes em bordô).
- **Excluir conta** exige digitar exatamente seu nome e remove o cadastro e todo o histórico associado, em uma única escrita no armazenamento.
- **Arquivar conta** mantém os registros anteriores e bloqueia novos registros até ser reativada.
- A lixeira dentro da tabela continua excluindo **somente o mês escolhido**.
- Para um mês ainda não preenchido, o botão **Usar valor de mês anterior** copia o último valor cadastrado.

### Espaços financeiros

- Na parte inferior da barra lateral, **Gerenciar espaços** permite criar novos espaços e excluir espaços personalizados.
- Excluir exige digitar exatamente o nome do espaço; são removidas as contas mensais, despesas fixas e transações locais vinculadas. A operação é **definitiva**, sem backup ou botão de desfazer.
- **Gustavo e Ana** é o espaço inicial e foi protegido contra exclusão, para preservar o armazenamento original.
- **Importante:** espaços locais não são usuários autenticados. Qualquer pessoa com acesso ao navegador pode ver os dados. O botão **Adicionar pessoa** continua desabilitado até haver autenticação e backend.

### Visual e relatórios

- Telas e formulários principais em **blocos verticais**, com largura moderada para leitura.
- **Caixas azul-acinzentadas** em modo claro e escuro.
- Ícones e valores de **despesas em bordô**; **sobras positivas em verde**.
- Visão Geral com comparativo entre receitas informadas e compromissos cadastrados. Se não houver receitas registradas, o sistema não deduz um saldo.
- Relatórios com **barras simples por mês**, gráfico de rosca para composição e filtros de tipo, período e categoria.
- O espaço financeiro selecionado na sidebar determina os dados exibidos em todas as telas.

### Como testar a v0.2

```bash
git fetch
git switch feat/v0.2-ux-contas-espacos-relatorios
npm install
npm run test
npm run build
npm run dev
```

Checklist manual recomendado:

1. Cadastre uma conta mensal, informe valores em dois meses, edite o nome e confirme que os meses foram preservados.
2. Arquive a conta, ative **Mostrar contas arquivadas**, reative-a e confirme que não perdeu histórico.
3. Exclua outra conta teste digitando seu nome; ela deve desaparecer da lista, do seletor e do histórico.
4. Crie um espaço de teste, cadastre despesas e exclua-o pelo gerenciador de espaços. O espaço padrão deve continuar intacto.
5. Confirme os valores em bordô para gastos e em verde para a sobra estimada; faça testes também no modo claro e em uma janela estreita.
6. Confira os gráficos de 6 e 12 meses e os filtros de categoria nos relatórios.

Não utilize dados financeiros sensíveis neste protótipo sem login, banco e backup seguro.

## Versão 0.3: Orçamentos de projetos e comparação de cotações

**Orçamentos** agora é o controle de projetos e propostas de profissionais/lojas. Não é o antigo planejamento de limite mensal por categoria.

### Exemplo: reforma do banheiro

1. Crie o projeto `Reforma do banheiro` com o limite desejado de `R$ 3.000,00`.
2. Adicione itens como `Pedreiro`, `Piso` e `Argamassa`. Cada item pode ter um limite próprio opcional.
3. No item `Pedreiro`, registre as propostas de diferentes profissionais com preço, prazo, indicação de material incluso e observações.
4. Escolha uma proposta; cada item permite **uma seleção ativa**, reversível.
5. Acompanhe o valor aprovado e a diferença em relação à meta.
6. Registre o que de fato foi pago, ou **vincule uma despesa já existente** da aba Lançamentos ao item.
7. Se houver erro, use **Desvincular**; a despesa original continuará em Lançamentos.

### Regras financeiras e escopo

- **Propostas e valores aprovados não são gastos realizados.** O total gasto do projeto soma somente despesas financeiras com vínculo ao projeto.
- A transação vinculada mantém seu único registro na aba Lançamentos. O Dashboard e os relatórios continuam somando essa transação **uma única vez**, sem criar um pagamento duplicado.
- Receitas não podem ser vinculadas como gastos do projeto.
- Cada espaço financeiro possui sua própria lista de projetos e cotações. Excluir um espaço personalizado também apaga seus projetos locais.
- A situação do projeto pode ser Planejando, Recebendo propostas, Aprovado, Em andamento ou Concluído.
- Nesta primeira versão, fotos/PDFs dos orçamentos, login, sincronização, backup automático e parcelamento não estão disponíveis.

### Testar no computador

```bash
git fetch origin
git switch feat/v0.3-orcamentos-projetos-cotacoes
npm install
npm run test
npm run build
npm run dev
```

Crie um projeto de R$ 3.000 e um item Pedreiro, registre propostas de R$ 3.500 e R$ 2.700 e escolha a segunda. Depois registre a entrada de R$ 1.000 no projeto e confirme a soma de **R$ 1.000 em gasto real**, distinta de **R$ 2.700 em orçamento aprovado**. A mesma despesa aparecerá em Lançamentos, sem duplicação no total.

## Backend em desenvolvimento · v0.4

A versão 0.4 adiciona uma **API independente em `backend/`** (Fastify + TypeScript + PostgreSQL + Prisma + verificação de JWT Supabase).

- [Guia de instalação e rotas do backend](backend/README.md).
- O frontend Vue atual **continua usando o armazenamento local**; nenhuma informação existente é migrada ou apagada nesta versão.
- As primeiras rotas disponibilizadas são `GET /api/v1/health`, `GET /api/v1/ready`, `GET /api/v1/workspaces` e `POST /api/v1/workspaces`.
- `/api/v1/workspaces` exige um JWT legítimo do Supabase Auth. O navegador ainda não tem tela de login.
- Prisma prepara a modelagem relacional de todos os módulos financeiros, mas os respectivos endpoints ainda precisam ser implementados.

Para começar, veja `backend/README.md`. A automação no GitHub testa frontend e backend em tarefas separadas.

**Não apague o localStorage durante esta fase.** A importação para o banco será desenvolvida em etapas.

## v0.5 · Autenticação Supabase no frontend (em desenvolvimento)

### O que foi incluído

- Rotas Vue `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` e `/conta`.
- Cadastro com confirmação de e-mail (se habilitada no Supabase), login e saída usando `@supabase/supabase-js`.
- Recuperação por e-mail e atualização de senha pelo link recebido.
- Sessão reativa e botão de acesso na barra superior do Farol.
- Em `/conta`, botão **Testar acesso à API protegida**, que usa o JWT da sessão para consultar `GET /api/v1/workspaces` do backend.
- Proxy **somente de desenvolvimento** em Vite (`/api` para `http://127.0.0.1:3333`), evitando depender de CORS enquanto ambos estão no PC.

### Configuração do Vue (Windows / PowerShell)

Na **raiz do projeto**, ao lado do `package.json` do Vue (não dentro de `backend/`):

```powershell
Copy-Item .env.example .env.local
```

Abra `.env.local` e substitua os exemplos pela **Project URL** e pela **publishable key** de **Supabase > Connect > Vue**:

```dotenv
VITE_SUPABASE_URL="https://SEU-PROJETO.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_SUA_CHAVE_PUBLICA"
```

Use somente a chave pública `sb_publishable_...` no navegador. **Nunca** coloque uma `sb_secret_...`, `service_role`, JWT secret ou senha do banco em variáveis `VITE_`.

Em **Supabase > Authentication > URL Configuration**, configure o **Site URL** para `http://localhost:5173` e adicione `http://localhost:5173/**` às URLs de redirecionamento autorizadas. Mantenha o login por e-mail habilitado. O Supabase precisa enviar e-mails de confirmação/recuperação; o serviço padrão tem limites para uso público.

### Iniciar no VS Code

Use dois terminais, na branch `feat/v0.5-auth-frontend-supabase`:

**Terminal da raiz do Vue:**

```powershell
npm install
npm run dev
```

**Terminal da pasta backend:**

```powershell
cd backend
npm install
npm run dev
```

O `backend/.env` deve conter a **mesma SUPABASE_URL** do Vue e o `DATABASE_URL` do Postgres local. Configure o banco e as migrações de acordo com `backend/README.md`.

1. Entre em `http://localhost:5173/cadastro` e cadastre um e-mail seu de teste.
2. Confirme o e-mail recebido, se necessário, e abra `/entrar`.
3. Vá para `/conta` e clique em **Testar acesso à API protegida**. Esse teste consulta apenas a associação de espaços do usuário na **API**, não os espaços locais.
4. Confira também o fluxo `/recuperar-senha`. Não compartilhe links de recuperação, senhas ou tokens.

### Limite desta etapa

**O login é real, mas não protege nem separa os dados financeiros do navegador!** O Farol ainda guarda contas, gastos e orçamentos no `localStorage`, que é compartilhado entre sessões e usuários do mesmo perfil do navegador. Não use dados sensíveis reais com expectativa de isolamento. Não há migração automática, backup, associação entre espaços locais e usuários ou sincronização. Entrar/sair não apaga os dados existentes. No próximo módulo, implementaremos a migração assistida e a autorização de todas as operações financeiras no servidor, antes de exigir login para usar as telas.

## Versão 0.6: confirmação por código e perfil

O cadastro agora aceita nome e confirmação por código de e-mail na própria página; a conta pode personalizar um ícone vetorial e editar o nome. A identidade é mostrada no canto inferior esquerdo. A mudança obrigatória do template **Confirm signup** no painel do Supabase, com `{{ .Token }}`, e os passos de teste estão em [docs/supabase-otp-perfil.md](docs/supabase-otp-perfil.md).

Até a migração financeira para o backend, os dados locais **não** ficam isolados por login.

## v0.7: sessão Supabase validada na API e espaços online

Em **Meu perfil**, o Farol agora valida a sessão com `GET /api/v1/me` e lista/cria espaços online com `GET/POST /api/v1/workspaces`. Os espaços são gravados em PostgreSQL, com permissões de usuário aplicadas no backend. Eles permanecem **separados dos espaços locais** até a migração assistida dos lançamentos e contas. O login ainda não protege os dados financeiros em `localStorage`.

[Guia completo de autenticação, Supabase SMTP/Brevo e primeiros espaços online](docs/autenticacao-v0.7.md).

## v0.8: barra lateral que acompanha a página

No desktop, o menu esquerdo acompanha a rolagem do Dashboard e mantém o gerenciamento de espaços e o perfil acessíveis. A rolagem de menus em telas baixas ocorre dentro da lateral, sem afetar o conteúdo principal. Em celulares, a navegação continua responsiva.

A análise de domínio gratuito recomenda **Cloudflare Pages** (`.pages.dev`) para testes e homologação do **frontend Vue**. Este endereço **não é um domínio próprio para autenticação de remetente Brevo**, não hospeda o backend Fastify nem torna o aplicativo financeiro pronto para produção. [Leia os cuidados e o teste da v0.8](docs/sidebar-dominio-v0.8.md).

## v0.9: barra lateral sem rolagens e hospedagem pessoal

A barra lateral agora é fixa durante a rolagem da página, com **Espaços** e **Perfil** no rodapé. Para janelas baixas, um menu **Mais páginas** agrupa os três últimos destinos, eliminando a dupla rolagem interna. A interface mobile permanece adaptada. Para este estágio **pessoal e não comercial**, a plataforma de hospedagem recomendada é **Vercel Hobby**, apenas para o frontend de teste, sem deploy automático nesta versão. [Guia e limitações](docs/sidebar-hospedagem-v0.9.md).
