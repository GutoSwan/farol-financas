import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../presentation/layouts/AppLayout.vue'
import DashboardPage from '../presentation/pages/DashboardPage.vue'
import BillsPage from '../presentation/pages/BillsPage.vue'
import FixedExpensesPage from '../presentation/pages/FixedExpensesPage.vue'
import TransactionsPage from '../presentation/pages/TransactionsPage.vue'
import ReportsPage from '../presentation/pages/ReportsPage.vue'
import BudgetsPage from '../presentation/pages/BudgetsPage.vue'
import ComingSoonPage from '../presentation/pages/ComingSoonPage.vue'
import AuthPage from '../presentation/pages/AuthPage.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [{
    path: '/',
    component: AppLayout,
    children: [
      { path: '', component: DashboardPage, meta: { title: 'Dashboard' } },
      { path: 'contas-mensais', component: BillsPage, meta: { title: 'Contas mensais' } },
      { path: 'gastos-fixos', component: FixedExpensesPage, meta: { title: 'Gastos fixos' } },
      { path: 'lancamentos', component: TransactionsPage, meta: { title: 'Lançamentos' } },
      { path: 'cartoes', component: ComingSoonPage, props: { title: 'Cartões de crédito' } },
      { path: 'orcamentos', component: BudgetsPage, meta: { title: 'Orçamentos' } },
      { path: 'relatorios', component: ReportsPage, meta: { title: 'Relatórios' } },
    ],
  },
  { path: '/entrar', component: AuthPage, props: { mode: 'login' }, meta: { title: 'Entrar' } },
  { path: '/cadastro', component: AuthPage, props: { mode: 'signup' }, meta: { title: 'Criar conta' } },
  { path: '/recuperar-senha', component: AuthPage, props: { mode: 'forgot' }, meta: { title: 'Recuperar senha' } },
  { path: '/redefinir-senha', component: AuthPage, props: { mode: 'reset' }, meta: { title: 'Nova senha' } },
  { path: '/conta', component: AuthPage, props: { mode: 'profile' }, meta: { title: 'Minha conta' } },
  ],
})
