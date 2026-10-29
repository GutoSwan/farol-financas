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
