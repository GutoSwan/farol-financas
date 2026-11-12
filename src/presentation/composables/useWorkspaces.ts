import { computed, ref } from 'vue'
import { DEFAULT_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'
import type { FinancialWorkspace } from '../../domain/entities/FinancialWorkspace'
import { BrowserWorkspaceRepository } from '../../infrastructure/persistence/BrowserWorkspaceRepository'
import { isLegacyOwnerSession } from '../../infrastructure/persistence/legacyAccess'
import { subscribeFinancialUiReset } from './financialUiSession'

const repository = new BrowserWorkspaceRepository()
const items = ref<FinancialWorkspace[]>([])
export const activeWorkspaceId = ref(DEFAULT_WORKSPACE_ID)
const error = ref('')

subscribeFinancialUiReset(() => {
  items.value = []
  error.value = ''
  activeWorkspaceId.value = DEFAULT_WORKSPACE_ID
})

function requireLocalOwner(): void {
  if (!isLegacyOwnerSession()) throw new Error('Confirme a conta vinculada aos dados locais antes de alterar um espaço.')
}

function loadWorkspaces(): void {
  if (!isLegacyOwnerSession()) {
    items.value = []
    activeWorkspaceId.value = DEFAULT_WORKSPACE_ID
    error.value = ''
    return
  }
  try {
    items.value = repository.list()
    activeWorkspaceId.value = repository.getActiveId()
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar os espaços.'
  }
}

export function useWorkspaces() {
  loadWorkspaces()

  function selectWorkspace(id: string): boolean {
    try {
      requireLocalOwner()
      repository.select(id)
      activeWorkspaceId.value = id
      error.value = ''
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Não foi possível trocar de espaço.'
      return false
    }
  }

  function createWorkspace(name: string): boolean {
    try {
      requireLocalOwner()
      const space = repository.create(name)
      items.value = repository.list()
      repository.select(space.id)
      activeWorkspaceId.value = space.id
      error.value = ''
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Não foi possível criar o espaço.'
      return false
    }
  }

  function deleteWorkspace(id: string): boolean {
    try {
      requireLocalOwner()
      repository.delete(id)
      items.value = repository.list()
      activeWorkspaceId.value = repository.getActiveId()
      error.value = ''
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Não foi possível excluir o espaço.'
      return false
    }
  }

  return {
    workspaces: computed(() => items.value),
    currentWorkspace: computed(() => items.value.find((item) => item.id === activeWorkspaceId.value)),
    activeWorkspaceId,
    error,
    selectWorkspace,
    createWorkspace,
    deleteWorkspace,
  }
}
