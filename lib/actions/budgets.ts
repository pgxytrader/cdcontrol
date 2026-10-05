'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { budgetChange, type BudgetRow } from '@/lib/finance/budget'
import { budgetChangeArgs } from '@/lib/recurrence-rpc'
import { translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { budgetSchema } from '@/lib/validation/budget'

/** Define (ou remove, com 0) o limite do mês: "só este mês" ou "a partir deste mês". */
export async function setBudget(input: unknown): Promise<ActionResult> {
  const parsed = budgetSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const { categoryId, month, amountCents, mode } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.from('budgets').select('category_id, month, amount_cents, repeats').eq('category_id', categoryId)
  if (error) return { ok: false, error: translateError(error) }

  const rows: BudgetRow[] = data.map((row) => ({
    categoryId: row.category_id,
    month: row.month,
    amountCents: Number(row.amount_cents),
    repeats: row.repeats,
  }))
  const { error: rpcError } = await supabase.rpc('apply_budget_change', budgetChangeArgs(categoryId, budgetChange(rows, categoryId, month, amountCents, mode)))
  if (rpcError) return { ok: false, error: translateError(rpcError) }

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}
