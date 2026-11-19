import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../presentation/layouts/AppLayout.vue'
import CloudOnlyLayout from '../presentation/layouts/CloudOnlyLayout.vue'
import DashboardPage from '../presentation/pages/DashboardPage.vue'
import BillsPage from '../presentation/pages/BillsPage.vue'
import FixedExpensesPage from '../presentation/pages/FixedExpensesPage.vue'
import TransactionsPage from '../presentation/pages/TransactionsPage.vue'
import ReportsPage from '../presentation/pages/ReportsPage.vue'
import GiftsPage from '../presentation/pages/GiftsPage.vue'
import MonthlyExpensesPage from '../presentation/pages/MonthlyExpensesPage.vue'
import BudgetsPage from '../presentation/pages/BudgetsPage.vue'
import CardsWorkspacePage from '../presentation/pages/CardsWorkspacePage.vue'
import CalendarPage from '../presentation/pages/CalendarPage.vue'
import LegacyDataAccessPage from '../presentation/pages/LegacyDataAccessPage.vue'
import LegacyBackupPage from '../presentation/pages/LegacyBackupPage.vue'
import MigrationReviewPage from '../presentation/pages/MigrationReviewPage.vue'
import AuthPage from '../presentation/pages/AuthPage.vue'
import { localLegacyAccess, setVerifiedLocalUser } from '../infrastructure/persistence/legacyAccess'
import { supabase } from '../infrastructure/auth/supabase'
import { canAccessWithoutSession, shouldRedirectLoggedInVisitor } from './authNavigation'
import { routeDocumentTitle } from './documentTitle'
import { useAuth } from '../presentation/composables/useAuth'
import { canAccessAdminOnlyFeature } from './privilegedAccess'

const router = createRouter({
  history: createWebHistory(),
  routes: [{
    path: '/',
    component: AppLayout,
    meta: { requiresLegacyData: true },
    children: [
      { path: '', component: DashboardPage, meta: { title: 'Visão geral' } },
      { path: 'contas-mensais', component: BillsPage, meta: { title: 'Contas mensais' } },
      { path: 'gastos-fixos', component: FixedExpensesPage, meta: { title: 'Gastos fixos' } },
      { path: 'lancamentos', component: TransactionsPage, meta: { title: 'Lançamentos' } },
      { path: 'cartoes', component: CardsWorkspacePage, meta: { title: 'Cartões de crédito' } },
      { path: 'orcamentos', component: BudgetsPage, meta: { title: 'Orçamentos' } },
      { path: 'relatorios', component: ReportsPage, meta: { title: 'Relatórios' } },
      { path: 'presentes', component: GiftsPage, meta: { title: 'Presentes', requiresAdmin: true } },
      { path: 'relatorios/detalhes', component: MonthlyExpensesPage, meta: { title: 'Detalhes do mês' } },
      // Rotas antigas continuam acessíveis para não deixar registros locais órfãos.
      { path: 'calendario', component: CalendarPage, meta: { title: 'Calendário antigo' } },
      { path: 'backup-financeiro', component: LegacyBackupPage, meta: { title: 'Backup', requiresLegacyData: true } },
      { path: 'revisar-migracao', component: MigrationReviewPage, meta: { title: 'Revisar dados antigos', requiresLegacyData: true } },
    ],
  },
  { path: '/dados-online', component: CloudOnlyLayout, meta: { title: 'Dados da família', requiresFinancialData: true } },
  { path: '/vincular-dados-locais', component: LegacyDataAccessPage, meta: { title: 'Proteção dos dados locais' } },
  { path: '/entrar', component: AuthPage, props: { mode: 'login' }, meta: { title: 'Entrar' } },
  { path: '/confirmar-email', component: AuthPage, props: { mode: 'confirmed' }, meta: { title: 'Confirmar e-mail' } },
  { path: '/recuperar-senha', component: AuthPage, props: { mode: 'forgot' }, meta: { title: 'Recuperar senha' } },
  { path: '/redefinir-senha', component: AuthPage, props: { mode: 'reset' }, meta: { title: 'Nova senha' } },
  { path: '/verificar-2fa', component: AuthPage, props: { mode: 'mfa' }, meta: { title: 'Confirmar autenticador' } },
  { path: '/configurar-2fa', component: AuthPage, props: { mode: 'enroll' }, meta: { title: 'Configurar autenticador' } },
  { path: '/conta', component: AuthPage, props: { mode: 'profile' }, meta: { title: 'Meu perfil' } },
  // Favoritos ou links antigos não podem reabrir recursos aposentados.
  { path: '/cadastro', redirect: '/entrar' },
  { path: '/entrar/celular', redirect: '/entrar' },
  { path: '/cadastro/celular', redirect: '/entrar' },
  { path: '/recuperar-celular', redirect: '/recuperar-senha' },
  { path: '/seguranca', redirect: '/conta' },
  ],
})

/**
 * Nenhuma tela privada abre apenas por existir um token no armazenamento.
 * A identidade é revalidada com o Supabase. A API também valida assinatura,
 * sessão ativa e vínculo financeiro de cada pessoa no servidor.
 */
router.beforeEach(async (to) => {
  setVerifiedLocalUser(null)
  const { recoveringPassword, refreshLoginMfa } = useAuth()
  if (!supabase) {
    return canAccessWithoutSession(to.path) ? true : { path: '/entrar', replace: true }
  }

  // Link de recuperação gera uma sessão temporária. Nunca dar acesso aos
  // dados financeiros antes de salvar a nova senha e entrar normalmente.
  if (recoveringPassword.value && to.path !== '/redefinir-senha' && to.path !== '/recuperar-senha') {
    return { path: '/redefinir-senha', replace: true }
  }

  let validatedUser: import('@supabase/supabase-js').User | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error) validatedUser = data.user
  } catch {
    // Sem identidade remota verificada, não abrir dados privados.
  }
  if (!validatedUser) {
    return canAccessWithoutSession(to.path) ? true : { path: '/entrar', replace: true }
  }
  // A senha cria apenas AAL1. Com TOTP cadastrado, nem links diretos podem
  // montar a interface ou recuperar dados locais até o desafio chegar a AAL2.
  if (to.path !== '/redefinir-senha' || !recoveringPassword.value) {
    const assurance = await refreshLoginMfa()
    if (assurance !== 'ready') {
      return to.path === '/verificar-2fa' ? true : { path: '/verificar-2fa', replace: true }
    }
    if (to.path === '/verificar-2fa') return { path: '/', replace: true }
  }
  if (shouldRedirectLoggedInVisitor(to.path, true)) return { path: '/', replace: true }

  // Ocultar o link no menu não protege URLs abertas diretamente.
  // Exigir papel remoto E sessão AAL2 mesmo se um administrador remover o TOTP.
  if (to.meta.requiresAdmin) {
    if (!canAccessAdminOnlyFeature(validatedUser)) return { path: '/', replace: true }
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error || data?.currentLevel !== 'aal2') return { path: '/conta', replace: true }
    } catch {
      // Falha na consulta nunca concede acesso administrativo.
      return { path: '/conta', replace: true }
    }
  }

  // Associar dados locais somente após verificar a identidade remotamente.
  setVerifiedLocalUser(validatedUser.id)
  if (to.meta.requiresLegacyData || to.path === '/vincular-dados-locais') {
    const access = localLegacyAccess(validatedUser.id)
    if (to.meta.requiresLegacyData && access === 'different-user') {
      return { path: '/dados-online', replace: true }
    }
    if (to.meta.requiresLegacyData && access !== 'allowed') {
      return { path: '/vincular-dados-locais', replace: true }
    }
    if (to.path === '/vincular-dados-locais' && access === 'allowed') {
      return { path: '/', replace: true }
    }
  }
  return true
})

router.afterEach((to) => {
  document.title = routeDocumentTitle(to.path, String(to.meta.title ?? ''))
})

export default router
