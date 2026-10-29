export function assertMoney(cents: number): void { if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Valor monetário inválido') }
export function parseBRLToCents(input: string): number {
 const clean = input.trim().replace(/^R\$\s*/, '').replace(/\s/g, '')
 if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(clean)) throw new Error('Informe um valor como 210,50')
 const [reais, centavos = ''] = clean.split(',')
 const amount = Number(reais.replaceAll('.', '')) * 100 + Number(centavos.padEnd(2,'0'))
 assertMoney(amount); return amount
}
export function formatBRL(cents: number): string { assertMoney(cents); return (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }
