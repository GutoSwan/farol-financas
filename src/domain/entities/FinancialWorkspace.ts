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

/** Segundo espaço fixo da família: finanças da Valora3D, separado do orçamento doméstico. */
export const VALORA3D_WORKSPACE_ID = 'valora3d-default'
export const VALORA3D_WORKSPACE: FinancialWorkspace = {
  id: VALORA3D_WORKSPACE_ID,
  name: 'Valora3D',
  createdAt: '2026-11-16T00:00:00.000Z',
}
