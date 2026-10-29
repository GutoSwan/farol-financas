import type { FixedExpenseRepository } from '../../domain/repositories/FixedExpenseRepository'
import type { FixedExpense } from '../../domain/entities/FixedExpense'
import { assertMoney } from '../../domain/value-objects/Money'
import { fixedExpensesForMonth, nextMonth, validMonth } from '../../domain/services/fixedExpenseAnalytics'

export function createFixedExpense(
  repository: FixedExpenseRepository,
  input: { name: string; amountCents: number; dueDay: number; startMonth: string },
): FixedExpense {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 80) throw new Error('O nome deve ter entre 2 e 80 caracteres.')
  assertMoney(input.amountCents)
  if (input.amountCents === 0) throw new Error('Informe um valor maior que zero.')
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) {
    throw new Error('Vencimento inválido.')
  }
  if (!validMonth(input.startMonth)) throw new Error('Mês inicial inválido.')
  const item: FixedExpense = {
    id: crypto.randomUUID(), name, amountCents: input.amountCents,
    dueDay: input.dueDay, startMonth: input.startMonth,
    endBeforeMonth: null, paidMonths: [], createdAt: new Date().toISOString(),
  }
  repository.save(item)
  return item
}

export function setFixedExpensePaid(
  repository: FixedExpenseRepository,
  id: string,
  month: string,
  paid: boolean,
): void {
  if (!validMonth(month)) throw new Error('Mês inválido.')
  const item = repository.list().find((entry) => entry.id === id)
  if (!item || !fixedExpensesForMonth([item], month).length) throw new Error('Despesa fixa não está ativa neste mês.')
  item.paidMonths = paid
    ? Array.from(new Set([...item.paidMonths, month]))
    : item.paidMonths.filter((value) => value !== month)
  repository.save(item)
}

/** Encerrar após um mês, sem apagar o histórico de períodos anteriores. */
export function endFixedExpenseAfterMonth(repository: FixedExpenseRepository, id: string, month: string): void {
  if (!validMonth(month)) throw new Error('Mês inválido.')
  const item = repository.list().find((entry) => entry.id === id)
  if (!item) throw new Error('Despesa fixa não encontrada.')
  if (month < item.startMonth || (item.endBeforeMonth && month >= item.endBeforeMonth)) {
    throw new Error('Escolha um mês em que essa despesa esteja ativa.')
  }
  item.endBeforeMonth = nextMonth(month)
  repository.save(item)
}
