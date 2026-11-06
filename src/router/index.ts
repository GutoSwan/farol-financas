import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../presentation/layouts/AppLayout.vue'
import DashboardPage from '../presentation/pages/DashboardPage.vue'
import BillsPage from '../presentation/pages/BillsPage.vue'
import FixedExpensesPage from '../presentation/pages/FixedExpensesPage.vue'
import TransactionsPage from '../presentation/pages/TransactionsPage.vue'
import ReportsPage from '../presentation/pages/ReportsPage.vue'
import GiftsPage from '../presentation/pages/GiftsPage.vue'
import MonthlyExpensesPage from '../presentation/pages/MonthlyExpensesPage.vue'
import BudgetsPage from '../presentation/pages/BudgetsPage.vue'
import ComingSoonPage from '../presentation/pages/ComingSoonPage.vue'
import AuthPage from '../presentation/pages/AuthPage.vue'
import { supabase } from '../infrastructure/auth/supabase'
import { shouldRedirectLoggedInVisitor } from './authNavigation'
import { isFarolAdmin } from '../domain/auth/adminAccess'

const router = createRouter({
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
      { path: 'presentes', component: GiftsPage, meta: { title: 'Presentes', requiresAdmin: true } },
      { path: 'relatorios/detalhes', component: MonthlyExpensesPage, meta: { title: 'Detalhes do mês' } },
    ],
  },
  { path: '/entrar', component: AuthPage, props: { mode: 'login' }, meta: { title: 'Entrar' } },
  { path: '/cadastro', component: AuthPage, props: { mode: 'signup' }, meta: { title: 'Criar conta' } },
  { path: '/recuperar-senha', component: AuthPage, props: { mode: 'forgot' }, meta: { title: 'Recuperar senha' } },
  { path: '/redefinir-senha', component: AuthPage, props: { mode: 'reset' }, meta: { title: 'Nova senha' } },
  { path: '/conta', component: AuthPage, props: { mode: 'profile' }, meta: { title: 'Minha conta' } },
  ],
})

// A Visão geral é a primeira tela após autenticação. As telas de recuperação
// permanecem acessíveis, mesmo quando o Supabase abre uma sessão temporária.
router.beforeEach(async (to) => {
  // A permissão é conferida no Supabase Auth remoto, sem confiar em display_name.
  if (to.meta.requiresAdmin) {
    if (!supabase) return { path: '/entrar', replace: true }
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) return { path: '/entrar', replace: true }
      if (!isFarolAdmin(data.user)) return { path: '/', replace: true }
    } catch {
      return { path: '/entrar', replace: true }
    }
  }
  if (!supabase || (to.path !== '/entrar' && to.path !== '/cadastro')) return true
  try {
    const { data, error } = await supabase.auth.getSession()
    if (!error && shouldRedirectLoggedInVisitor(to.path, !!data.session)) {
      return { path: '/', replace: true }
    }
  } catch {
    // Se a sessão não puder ser restaurada, a tela de login permanece acessível.
  }
  return true
})

export default router
