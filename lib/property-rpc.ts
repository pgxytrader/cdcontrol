// lib/property-rpc.ts
import { cycleColumns } from '@/lib/card-rpc'
import type { FundingSource } from '@/lib/finance/property'
import type { PaymentTransaction } from '@/lib/finance/property-payment'
import type { PropertyOutput } from '@/lib/validation/property'

/** Campos do formulário nas colunas de properties (sem household_id). */
export function propertyColumns(property: PropertyOutput) {
  return {
    name: property.name,
    developer: property.developer,
    unit: property.unit,
    address: property.address,
    purchase_price_cents: property.purchasePriceCents,
    contract_date: property.contractDate,
    expected_delivery_date: property.expectedDeliveryDate,
    phase: property.phase,
    bank: property.bank,
    financed_amount_cents: property.financedAmountCents,
    term_months: property.termMonths,
    amortization_system: property.amortizationSystem,
    annual_interest_rate: property.annualInterestRate,
  }
}

export type ExpenseRowInput = {
  expenseTypeId: string
  description: string
  payee: string | null
  plannedAmountCents: number
  dueDate: string
  fundingSource: FundingSource
  notes: string | null
}

/** Linhas de create_property_expenses. */
export function expenseRows(rows: ExpenseRowInput[]) {
  return rows.map((row) => ({
    expense_type_id: row.expenseTypeId,
    description: row.description,
    payee: row.payee,
    planned_amount_cents: row.plannedAmountCents,
    due_date: row.dueDate,
    funding_source: row.fundingSource,
    notes: row.notes,
  }))
}

/** Argumentos de pay_property_expense: dados do pagamento e, se houver, o lançamento (no cartão, com o ciclo da fatura). */
export function payArgs(
  expenseId: string,
  paid: { paidAmountCents: number; paidDate: string; fundingSource: FundingSource },
  tx: PaymentTransaction | null,
) {
  return {
    p_expense_id: expenseId,
    p_paid: { paid_amount_cents: paid.paidAmountCents, paid_date: paid.paidDate, funding_source: paid.fundingSource },
    p_transaction: tx
      ? {
          description: tx.description,
          amount_cents: tx.amountCents,
          date: tx.date,
          status: tx.status,
          category_id: tx.categoryId,
          account_id: tx.accountId,
          credit_card_id: tx.creditCardId,
          ...(tx.cycle ? cycleColumns(tx.cycle) : {}),
        }
      : null,
  }
}
