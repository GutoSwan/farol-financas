/** Um espaço agrupa dados financeiros. Não representa uma identidade autenticada. */
export interface FinancialWorkspace {
  id: string
  name: string
  createdAt: string
}

export const DEFAULT_WORKSPACE_ID = 'household-default'
export const DEFAULT_WORKSPACE: FinancialWorkspace = {
  id: DEFAULT_WORKSPACE_ID,
  name: 'Gustavo e Ana',
  createdAt: '2026-10-29T00:00:00.000Z',
}
