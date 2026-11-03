import { supabase } from '../auth/supabase'
import { apiEndpoint } from './apiEndpoint'

export type OnlineWorkspaceRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export interface OnlineWorkspace {
  id: string
  name: string
  role: OnlineWorkspaceRole
}

export interface OnlineIdentity { id: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWorkspace(value: unknown): value is OnlineWorkspace {
  if (!isObject(value)) return false
  return typeof value.id === 'string' && typeof value.name === 'string' &&
    (value.role === 'OWNER' || value.role === 'EDITOR' || value.role === 'VIEWER')
}

async function apiRequest(path: string, options: { method?: 'GET' | 'POST'; body?: object } = {}): Promise<unknown> {
  if (!supabase) throw new Error('Configure o Supabase no arquivo .env.local do frontend.')
  // No browser, getSession pode ser restaurada/atualizada pela biblioteca Supabase.
  // O backend TEM de validar assinatura, issuer, audience e exp do JWT recebido.
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Sua sessão expirou. Entre na sua conta novamente.')

  let response: Response
  try {
    response = await fetch(apiEndpoint(path), {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
    })
  } catch {
    throw new Error('Não foi possível acessar a API. Confira o endereço HTTPS do backend e a configuração de CORS.')
  }

  if (response.status === 401) throw new Error('O backend recusou o token. Confira a URL do Supabase no frontend e no backend.')
  if (response.status === 403) throw new Error('Você não tem permissão para realizar esta ação.')
  if (response.status === 400) throw new Error('Dados inválidos. Verifique as informações enviadas.')
  if (!response.ok) throw new Error('A API não conseguiu completar a operação. Confira o PostgreSQL e as migrações.')

  try {
    return await response.json() as unknown
  } catch {
    throw new Error('A API retornou uma resposta inválida.')
  }
}

export async function getOnlineIdentity(): Promise<OnlineIdentity> {
  const result = await apiRequest('/api/v1/me')
  if (!isObject(result) || !isObject(result.data) || typeof result.data.id !== 'string') {
    throw new Error('Resposta de autenticação inesperada.')
  }
  return { id: result.data.id }
}

export async function listOnlineWorkspaces(): Promise<OnlineWorkspace[]> {
  const result = await apiRequest('/api/v1/workspaces')
  if (!isObject(result) || !Array.isArray(result.data) || !result.data.every(isWorkspace)) {
    throw new Error('Resposta de espaços online inesperada.')
  }
  return result.data
}

export async function createOnlineWorkspace(nameInput: string): Promise<OnlineWorkspace> {
  const name = nameInput.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 60) throw new Error('O nome do espaço deve ter de 2 a 60 caracteres.')
  const result = await apiRequest('/api/v1/workspaces', { method: 'POST', body: { name } })
  if (!isObject(result) || !isWorkspace(result.data)) throw new Error('Resposta de criação de espaço inesperada.')
  return result.data
}
