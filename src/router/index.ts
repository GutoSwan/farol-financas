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
import { canAccessWithoutSession, shouldRedirectLoggedInVisitor } from './authNavigation'
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

// Todas as telas financeiras exigem uma sessão Supabase antes da navegação.
// A verificação assíncrona acontece antes de renderizar o dashboard, evitando
// mostrar dados locais durante a restauração de sessão no primeiro acesso.
// Cadastro e recuperação de senha continuam públicos.
router.beforeEach(async (to) => {
  if (!supabase) {
    return canAccessWithoutSession(to.path) ? true : { path: '/entrar', replace: true }
  }

  let authenticated = false
  try {
    const { data, error } = await supabase.auth.getSession()
    authenticated = !error && !!data.session
  } catch {
    // Na ausência de sessão recuperável, não abrir páginas financeiras.
  }

  if (!authenticated && !canAccessWithoutSession(to.path)) {
    return { path: '/entrar', replace: true }
  }

  if (shouldRedirectLoggedInVisitor(to.path, authenticated)) {
    return { path: '/', replace: true }
  }

  // Permissões de administrador seguem validadas diretamente no Auth remoto.
  if (to.meta.requiresAdmin) {
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) return { path: '/entrar', replace: true }
      if (!isFarolAdmin(data.user)) return { path: '/', replace: true }
    } catch {
      return { path: '/entrar', replace: true }
    }
  }

  return true
})

export default router
