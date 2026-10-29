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
