/** A versão enviada pelo cliente foi substituída por uma gravação mais recente.
 * Nunca lançar este erro para registros de outros workspaces (não revelar existência).
 */
export class StaleFinancialRecordError extends Error {
  constructor() {
    super('Este registro foi alterado em outra sessão. Atualize os dados antes de salvar novamente.')
    this.name = 'StaleFinancialRecordError'
  }
}
