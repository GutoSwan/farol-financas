/**
 * Descarrega os arrays reativos contendo dados financeiros assim que a sessão
 * deixa de pertencer à conta verificada. Não lê nem apaga dados persistentes.
 * O guard do router e o vínculo local continuam sendo as barreiras de acesso.
 */
type ResetListener = () => void
const listeners = new Set<ResetListener>()

export function subscribeFinancialUiReset(listener: ResetListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function invalidateFinancialUiSession(): void {
  for (const listener of listeners) {
    try { listener() }
    catch { /* Uma tela não pode impedir a limpeza das demais. */ }
  }
}
