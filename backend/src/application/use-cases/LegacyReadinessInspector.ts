/**
 * Inventário exato do workspace no servidor: somente leitura.
 * Nenhuma identidade local, nome de lançamento ou dado financeiro é enviado.
 * OWNER e AAL2 são exigidos na rota; o repositório revalida OWNER no banco.
 */
export interface LegacyReadinessCounts {
  transactions: number
  recurringBills: number
  monthlyEntries: number
  fixedExpenses: number
  fixedPayments: number
  budgetProjects: number
  budgetItems: number
  budgetQuotes: number
  legacyMappings: number
}
export interface LegacyReadiness {
  workspaceId: string
  counts: LegacyReadinessCounts
  state: 'empty' | 'occupied' | 'mapped'
  exact: true
}
export interface LegacyReadinessInspector {
  inspect(ownerUserId: string, workspaceId: string): Promise<LegacyReadiness>
}
export class LegacyReadinessForbiddenError extends Error {
  constructor(){super('Espaço não encontrado.');this.name='LegacyReadinessForbiddenError'}
}
