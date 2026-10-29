import { computed, ref } from 'vue'
import { DEFAULT_WORKSPACE_ID } from '../../domain/entities/FinancialWorkspace'
import type { FinancialWorkspace } from '../../domain/entities/FinancialWorkspace'
import { BrowserWorkspaceRepository } from '../../infrastructure/persistence/BrowserWorkspaceRepository'

const repository = new BrowserWorkspaceRepository()
const items = ref<FinancialWorkspace[]>([])
export const activeWorkspaceId = ref(DEFAULT_WORKSPACE_ID)
const error = ref('')

function loadWorkspaces(): void {
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

  return {
    workspaces: computed(() => items.value),
    currentWorkspace: computed(() => items.value.find((item) => item.id === activeWorkspaceId.value)),
    activeWorkspaceId,
    error,
    selectWorkspace,
    createWorkspace,
  }
}
