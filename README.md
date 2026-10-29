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

