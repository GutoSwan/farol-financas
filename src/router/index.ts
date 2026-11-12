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
import ComingSoonPage from '../presentation/pages/ComingSoonPage.vue'
import CalendarPage from '../presentation/pages/CalendarPage.vue'
import LegacyDataAccessPage from '../presentation/pages/LegacyDataAccessPage.vue'
import LegacyBackupPage from '../presentation/pages/LegacyBackupPage.vue'
import MigrationReviewPage from '../presentation/pages/MigrationReviewPage.vue'
import { localLegacyAccess, setVerifiedLocalUser } from '../infrastructure/persistence/legacyAccess'
import AuthPage from '../presentation/pages/AuthPage.vue'
import PhoneAuthPage from '../presentation/pages/PhoneAuthPage.vue'
import MfaChallengePage from '../presentation/pages/MfaChallengePage.vue'
import MfaSetupPage from '../presentation/pages/MfaSetupPage.vue'
import { supabase } from '../infrastructure/auth/supabase'
import { listVerifiedTotpFactors } from '../infrastructure/auth/totpMfa'
import { canAccessWithoutSession, shouldRedirectLoggedInVisitor } from './authNavigation'
import { requiredMfaRedirect } from './mfaNavigation'
import { isFarolAdmin, isFarolSuperAdmin } from '../domain/auth/adminAccess'
import { routeDocumentTitle } from './documentTitle'
import { allowedSuperAdminRecoveryRoute } from './superAdminRecovery'
import { useAuth } from '../presentation/composables/useAuth'
import AccountSecurityPage from '../presentation/pages/AccountSecurityPage.vue'

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
      { path: 'presentes', component: GiftsPage, meta: { title: 'Presentes', requiresAdmin: true } },
      { path: 'relatorios/detalhes', component: MonthlyExpensesPage, meta: { title: 'Detalhes do mês' } },
      { path: 'backup-financeiro', component: LegacyBackupPage,
        meta: { title: 'Backup e restauração', requiresLegacyData: true } },
      { path: 'revisar-migracao', component: MigrationReviewPage,
        meta: { title: 'Revisar migração', requiresLegacyData: true } },
    ],
  },
  // A tela online fica fora do AppLayout: não lê/mostra dados locais de outra conta.
  { path: '/dados-online', component: CloudOnlyLayout, meta: { title: 'Dados na nuvem', requiresFinancialData: true } },
  { path: '/entrar/celular', component: PhoneAuthPage, props: { mode: 'login' }, meta: { title: 'Entrar por celular' } },
  { path: '/cadastro/celular', component: PhoneAuthPage, props: { mode: 'signup' }, meta: { title: 'Criar conta por celular' } },
  { path: '/recuperar-celular', component: PhoneAuthPage, props: { mode: 'recovery' }, meta: { title: 'Recuperação por celular' } },
  { path: '/verificar-2fa', component: MfaChallengePage, meta: { title: 'Verificar código' } },
  { path: '/configurar-2fa', component: MfaSetupPage, meta: { title: 'Configurar autenticador' } },
  { path: '/vincular-dados-locais', component: LegacyDataAccessPage, meta: { title: 'Proteção dos dados locais' } },
  { path: '/entrar', component: AuthPage, props: { mode: 'login' }, meta: { title: 'Entrar' } },
  { path: '/cadastro', component: AuthPage, props: { mode: 'signup' }, meta: { title: 'Criar conta' } },
  { path: '/confirmar-email', component: AuthPage, props: { mode: 'confirmed' }, meta: { title: 'Confirmação de e-mail' } },
  { path: '/recuperar-senha', component: AuthPage, props: { mode: 'forgot' }, meta: { title: 'Recuperar senha' } },
  { path: '/redefinir-senha', component: AuthPage, props: { mode: 'reset' }, meta: { title: 'Nova senha' } },
  { path: '/conta', component: AuthPage, props: { mode: 'profile' }, meta: { title: 'Minha conta' } },
  { path: '/seguranca', component: AccountSecurityPage, meta: { title: 'Segurança e acesso' } },
  ],
})

// Frontend controla a navegação, mas APIs financeiras devem validar AAL2
// no SERVIDOR antes de consultar dados, mesmo se alguém ignorar o roteador.
router.beforeEach(async (to) => {
  setVerifiedLocalUser(null)
  const { recoveringPassword, recoveryMfaVerified } = useAuth()
  let superAdminRecoveryProfile = false
  if (!supabase) {
    return canAccessWithoutSession(to.path) ? true : { path: '/entrar', replace: true }
  }

  let authenticated = false
  try {
    // getSession() lê o estado local e não garante que o usuário ainda esteja válido.
    // getUser() consulta o Supabase Auth e valida o token antes de abrir rotas privadas.
    const { data, error } = await supabase.auth.getUser()
    authenticated = !error && !!data.user
    if (authenticated && data.user && isFarolSuperAdmin(data.user)) {
      const allowed = allowedSuperAdminRecoveryRoute(
        to.path, recoveringPassword.value, recoveryMfaVerified.value,
      )
      if (!allowed) {
        // A conta Super Admin continua bloqueada em todas as áreas financeiras.
        authenticated = false
        setVerifiedLocalUser(null)
        await supabase.auth.signOut({ scope: 'local' })
      } else {
        superAdminRecoveryProfile = to.path === '/conta'
        // Nunca dar acesso aos dados financeiros locais neste site.
        setVerifiedLocalUser(null)
      }
    } else if (authenticated && data.user) setVerifiedLocalUser(data.user.id)
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

  const requiresAssurance = to.path === '/verificar-2fa' || to.path === '/configurar-2fa' || !canAccessWithoutSession(to.path)
  if (requiresAssurance) {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error || !data) throw new Error('Não foi possível conferir o segundo fator.')
      // A lista de fatores verificados é consultada no Supabase, nunca em
      // localStorage: apagar o app do celular não desativa o TOTP no servidor.
      const factors = await listVerifiedTotpFactors()
      // A exceção de Meu perfil para Super Admin exige AAL2 REAL e fator ativo.
      if (superAdminRecoveryProfile &&
          (data.currentLevel !== 'aal2' || factors.length === 0)) {
        return { path: '/redefinir-senha', replace: true }
      }
      const target = requiredMfaRedirect(
        to.path,
        Boolean(to.meta.requiresLegacyData || to.meta.requiresFinancialData) || to.path === '/vincular-dados-locais',
        data.currentLevel,
        data.nextLevel,
        factors.length,
      )
      if (target) return { path: target, replace: true }
    } catch {
      // Não encaminhar um Super Admin em recuperação para login financeiro.
      if (superAdminRecoveryProfile) return { path: '/redefinir-senha', replace: true }
      // Em falha da verificação MFA, NÃO liberar dados financeiros.
      if (to.path !== '/verificar-2fa' && to.path !== '/configurar-2fa') {
        return { path: '/verificar-2fa', replace: true }
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
    // Se este navegador pertence a outra identidade, abrir somente a nuvem
    // sem inicializar telas nem repositórios financeiros locais.
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
  // Título do navegador identifica claramente a área e não substitui
  // os guardas de acesso da API.
  document.title = routeDocumentTitle(to.path, String(to.meta.title ?? ''))
})

export default router
