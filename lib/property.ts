// lib/property.ts
import 'server-only'
import { fetchAllPages } from '@/lib/fetch-all'
import {
  expenseStatus,
  propertySummary,
  type AmortizationSystem,
  type ExpenseStatus,
  type ExpenseType,
  type FundingSource,
  type PropertyPhase,
  type PropertySummary,
  type TypicalPhase,
} from '@/lib/finance/property'
import { createClient } from '@/lib/supabase/server'
import { EXPENSE_RECORD_COLUMNS, type ExpenseView, type PropertyRecord } from '@/lib/validation/property'

const PROPERTY_COLUMNS =
  'id, name, developer, unit, address, purchase_price_cents, contract_date, expected_delivery_date, phase, bank, financed_amount_cents, term_months, amortization_system, annual_interest_rate'

type PropertyRow = {
  id: string
  name: string
  developer: string | null
  unit: string | null
  address: string | null
  purchase_price_cents: number
  contract_date: string | null
  expected_delivery_date: string | null
  phase: string
  bank: string | null
  financed_amount_cents: number | null
  term_months: number | null
  amortization_system: string | null
  annual_interest_rate: number | string | null
}

function toProperty(row: PropertyRow): PropertyRecord {
  return {
    id: row.id,
    name: row.name,
    developer: row.developer,
    unit: row.unit,
    address: row.address,
    purchasePriceCents: Number(row.purchase_price_cents),
    contractDate: row.contract_date,
    expectedDeliveryDate: row.expected_delivery_date,
    phase: row.phase as PropertyPhase,
    bank: row.bank,
    financedAmountCents: row.financed_amount_cents === null ? null : Number(row.financed_amount_cents),
    termMonths: row.term_months,
    amortizationSystem: row.amortization_system as AmortizationSystem | null,
    annualInterestRate: row.annual_interest_rate === null ? null : Number(row.annual_interest_rate),
  }
}

/** Imóveis da casa; o primeiro (mais antigo) é o principal. */
export async function listProperties(): Promise<PropertyRecord[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('properties').select(PROPERTY_COLUMNS).order('created_at').order('id')
  if (error) throw error
  return (data as PropertyRow[]).map(toProperty)
}

/** Todos os tipos de gasto (inclusive arquivados), na ordem do cadastro. */
export async function listExpenseTypes(): Promise<ExpenseType[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('property_expense_types')
    .select('id, name, typical_phase, sort_order, is_default, system_key, archived')
    .order('sort_order')
    .order('name')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    typicalPhase: row.typical_phase as TypicalPhase,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    systemKey: row.system_key,
    archived: row.archived,
  }))
}

type ExpenseRow = {
  id: string
  property_id: string
  expense_type_id: string
  description: string
  payee: string | null
  planned_amount_cents: number
  due_date: string
  status: string
  paid_amount_cents: number | null
  paid_date: string | null
  funding_source: string
  transaction_id: string | null
  notes: string | null
  transactions: { account_id: string | null; credit_card_id: string | null; category_id: string | null } | null
}

function toExpense(row: ExpenseRow): ExpenseView {
  return {
    id: row.id,
    propertyId: row.property_id,
    expenseTypeId: row.expense_type_id,
    description: row.description,
    payee: row.payee,
    plannedAmountCents: Number(row.planned_amount_cents),
    dueDate: row.due_date,
    status: row.status as 'planned' | 'paid',
    paidAmountCents: row.paid_amount_cents === null ? null : Number(row.paid_amount_cents),
    paidDate: row.paid_date,
    fundingSource: row.funding_source as FundingSource,
    transactionId: row.transaction_id,
    notes: row.notes,
    linked: row.transactions
      ? { accountId: row.transactions.account_id, creditCardId: row.transactions.credit_card_id, categoryId: row.transactions.category_id }
      : null,
  }
}

/** Gastos do imóvel por vencimento, com conta/cartão/categoria do lançamento ligado. `propertyId` já validado. */
export async function listPropertyExpenses(propertyId: string): Promise<ExpenseView[]> {
  const supabase = await createClient()
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('property_expenses')
      .select(`${EXPENSE_RECORD_COLUMNS}, transactions(account_id, credit_card_id, category_id)`)
      .eq('property_id', propertyId)
      .order('due_date')
      .order('description')
      .order('id')
      .range(from, to),
  )
  return (rows as unknown as ExpenseRow[]).map(toExpense)
}

/** Gasto ligado a um lançamento (para "Editar no Imóvel"). `transactionId` já validado. */
export async function findExpenseByTransaction(transactionId: string): Promise<{ propertyId: string; expenseId: string } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('property_expenses').select('id, property_id').eq('transaction_id', transactionId).maybeSingle()
  if (error) throw error
  return data ? { propertyId: data.property_id, expenseId: data.id } : null
}

export type PropertyCard = { propertyId: string; name: string; summary: PropertySummary; nextStatus: ExpenseStatus | null }

/** Card do Início: resumo do imóvel principal, ou null se não há imóvel. */
export async function getPropertyCard(today: string): Promise<PropertyCard | null> {
  const [properties, types] = await Promise.all([listProperties(), listExpenseTypes()])
  const property = properties[0]
  if (!property) return null
  const expenses = await listPropertyExpenses(property.id)
  const summary = propertySummary(property.purchasePriceCents, expenses, new Map(types.map((type) => [type.id, type.systemKey])))
  return {
    propertyId: property.id,
    name: property.name,
    summary,
    nextStatus: summary.next ? expenseStatus(summary.next, today) : null,
  }
}
