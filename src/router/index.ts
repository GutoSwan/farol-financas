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
import CalendarPage from '../presentation/pages/CalendarPage.vue'
import OnlineFinancePage from '../presentation/pages/OnlineFinancePage.vue'
import LegacyDataAccessPage from '../presentation/pages/LegacyDataAccessPage.vue'
import { localLegacyAccess, setVerifiedLocalUser } from '../infrastructure/persistence/legacyAccess'
import AuthPage from '../presentation/pages/AuthPage.vue'
import MfaChallengePage from '../presentation/pages/MfaChallengePage.vue'
import { supabase } from '../infrastructure/auth/supabase'
import { canAccessWithoutSession, shouldRedirectLoggedInVisitor } from './authNavigation'
import { requiredMfaRedirect } from './mfaNavigation'
import { isFarolAdmin } from '../domain/auth/adminAccess'

const router = createRouter({
  history: createWebHistory(),
  routes: [{
    path: '/',
    component: AppLayout,
    meta: { requiresLegacyData: true },
    children: [
      { path: '', component: DashboardPage, meta: { title: 'Dashboard' } },
      { path: 'contas-mensais', component: BillsPage, meta: { title: 'Contas mensais' } },
      { path: 'gastos-fixos', component: FixedExpensesPage, meta: { title: 'Gastos fixos' } },
      { path: 'lancamentos', component: TransactionsPage, meta: { title: 'Lançamentos' } },
      { path: 'cartoes', component: ComingSoonPage, props: { title: 'Cartões de crédito' } },
      { path: 'orcamentos', component: BudgetsPage, meta: { title: 'Orçamentos' } },
      { path: 'relatorios', component: ReportsPage, meta: { title: 'Relatórios' } },
      { path: 'calendario', component: CalendarPage, meta: { title: 'Calendário' } },
      { path: 'dados-online', component: OnlineFinancePage, meta: { title: 'Dados na nuvem' } },
      { path: 'presentes', component: GiftsPage, meta: { title: 'Presentes', requiresAdmin: true } },
      { path: 'relatorios/detalhes', component: MonthlyExpensesPage, meta: { title: 'Detalhes do mês' } },
    ],
  },
  { path: '/verificar-2fa', component: MfaChallengePage, meta: { title: 'Verificar código' } },
  { path: '/vincular-dados-locais', component: LegacyDataAccessPage, meta: { title: 'Proteção dos dados locais' } },
  { path: '/entrar', component: AuthPage, props: { mode: 'login' }, meta: { title: 'Entrar' } },
  { path: '/cadastro', component: AuthPage, props: { mode: 'signup' }, meta: { title: 'Criar conta' } },
  { path: '/recuperar-senha', component: AuthPage, props: { mode: 'forgot' }, meta: { title: 'Recuperar senha' } },
  { path: '/redefinir-senha', component: AuthPage, props: { mode: 'reset' }, meta: { title: 'Nova senha' } },
  { path: '/conta', component: AuthPage, props: { mode: 'profile' }, meta: { title: 'Minha conta' } },
  ],
})

// Frontend controla a navegação, mas APIs financeiras devem validar AAL2
// no SERVIDOR antes de consultar dados, mesmo se alguém ignorar o roteador.
router.beforeEach(async (to) => {
  setVerifiedLocalUser(null)
  if (!supabase) {
    return canAccessWithoutSession(to.path) ? true : { path: '/entrar', replace: true }
  }

  let authenticated = false
  try {
    // getSession() lê o estado local e não garante que o usuário ainda esteja válido.
    // getUser() consulta o Supabase Auth e valida o token antes de abrir rotas privadas.
    const { data, error } = await supabase.auth.getUser()
    authenticated = !error && !!data.user
    if (authenticated && data.user) setVerifiedLocalUser(data.user.id)
  } catch {
    // Não mostrar telas financeiras se a sessão não puder ser restaurada.
  }

  if (!authenticated) {
    if (!canAccessWithoutSession(to.path)) return { path: '/entrar', replace: true }
    return true
  }

  if (shouldRedirectLoggedInVisitor(to.path, authenticated)) {
    return { path: '/', replace: true }
  }

  const requiresAssurance = to.path === '/verificar-2fa' || !canAccessWithoutSession(to.path)
  if (requiresAssurance) {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error || !data) throw new Error('Não foi possível conferir o segundo fator.')
      const target = requiredMfaRedirect(
        to.path,
        Boolean(to.meta.requiresLegacyData) || to.path === '/vincular-dados-locais',
        data.currentLevel,
        data.nextLevel,
      )
      if (target) return { path: target, replace: true }
    } catch {
      // Em falha da verificação MFA, NÃO liberar dados financeiros.
      if (to.path !== '/conta' && to.path !== '/verificar-2fa') {
        return { path: '/conta', replace: true }
      }
    }
  }

  if (to.meta.requiresAdmin) {
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) return { path: '/entrar', replace: true }
      if (!isFarolAdmin(data.user)) return { path: '/', replace: true }
    } catch {
      return { path: '/entrar', replace: true }
    }
  }

  if (to.meta.requiresLegacyData || to.path === '/vincular-dados-locais') {
    // Nunca carregar o layout, a sidebar ou os composables locais antes
    // de verificar o vínculo da conta; eles leem localStorage no setup.
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      setVerifiedLocalUser(null)
      return { path: '/entrar', replace: true }
    }
    const access = localLegacyAccess(data.user.id)
    if (to.meta.requiresLegacyData && access !== 'allowed') {
      return { path: '/vincular-dados-locais', replace: true }
    }
    if (to.path === '/vincular-dados-locais' && access === 'allowed') {
      return { path: '/', replace: true }
    }
  }

  return true
})

export default router
