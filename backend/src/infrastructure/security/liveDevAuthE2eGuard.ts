/**
 * Travas do teste integrado com Supabase Auth real.
 * Esta rotina NÃO é configuração de produção nem concede permissões.
 */
export const LIVE_QA_DEV_REF = 'tvirkrjkgdtybtcundon'
export const LIVE_QA_AUTH_ORIGIN = `https://${LIVE_QA_DEV_REF}.supabase.co`
export const LIVE_QA_API_ORIGIN = 'https://farol-api-git-feat-password-safety-free-20261117-farol13.vercel.app'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface LiveDevAuthE2eConfig {
  apiKey: string
  owner: { email: string; password: string }
  viewer: { email: string; password: string }
  sharedWorkspaceId: string
  privateWorkspaceId: string
}

/** Fail-closed: não aceitar URL arbitrária, produção ou contas pessoais comuns. */
export function requireLiveDevAuthE2eConfig(env: NodeJS.ProcessEnv): LiveDevAuthE2eConfig {
  if (env.FAROL_QA_LIVE_DEV_AUTH_E2E !== 'READ_ONLY_DEV' ||
      env.FAROL_DEV_SUPABASE_REF !== LIVE_QA_DEV_REF ||
      env.SUPABASE_URL !== LIVE_QA_AUTH_ORIGIN ||
      env.FAROL_QA_API_ORIGIN !== LIVE_QA_API_ORIGIN ||
      env.VERCEL_ENV === 'production' ||
      env.FAROL_FINANCIAL_WRITES_ENABLED === 'true' ||
      env.FAROL_INVOICE_UPLOADS_ENABLED === 'true' ||
      env.FAROL_INVOICE_READS_ENABLED === 'true') {
    throw new Error('E2E não iniciado: configure exclusivamente Supabase Dev e Preview de testes.')
  }
  const apiKey = env.SUPABASE_PUBLISHABLE_KEY ?? ''
  if (!/^sb_publishable_[a-zA-Z0-9_-]{15,}$/.test(apiKey)) {
    throw new Error('E2E não iniciado: chave pública Dev ausente ou inválida.')
  }
  const ownerEmail = env.FAROL_QA_OWNER_EMAIL?.trim().toLowerCase() ?? ''
  const viewerEmail = env.FAROL_QA_VIEWER_EMAIL?.trim().toLowerCase() ?? ''
  // Aceita e-mail técnico dedicado ou alias com +farol-qa-owner/viewer-...
  const qaEmail = (email: string, role: 'owner'|'viewer') =>
    new RegExp(`^(?:farol-qa-${role}-[^@]+|[^@]+\\+farol-qa-${role}-[^@]+)@[^@]+\\.[^@]+$`).test(email)
  if (!qaEmail(ownerEmail, 'owner') || !qaEmail(viewerEmail, 'viewer') || ownerEmail === viewerEmail ||
      !env.FAROL_QA_OWNER_PASSWORD || !env.FAROL_QA_VIEWER_PASSWORD) {
    throw new Error('E2E não iniciado: faltam duas contas técnicas descartáveis distintas (owner/viewer).')
  }
  const sharedWorkspaceId = env.FAROL_QA_SHARED_WORKSPACE_ID ?? ''
  const privateWorkspaceId = env.FAROL_QA_PRIVATE_WORKSPACE_ID ?? ''
  if (!uuid.test(sharedWorkspaceId) || !uuid.test(privateWorkspaceId) ||
      sharedWorkspaceId === privateWorkspaceId) {
    throw new Error('E2E não iniciado: forneça dois UUIDs diferentes de espaços QA no Dev.')
  }
  return {
    apiKey,
    owner: { email: ownerEmail, password: env.FAROL_QA_OWNER_PASSWORD },
    viewer: { email: viewerEmail, password: env.FAROL_QA_VIEWER_PASSWORD },
    sharedWorkspaceId, privateWorkspaceId,
  }
}
