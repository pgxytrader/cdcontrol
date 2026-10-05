// lib/actions/property-types.ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentHousehold } from '@/lib/household'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import { expenseTypeSchema } from '@/lib/validation/property'

function done() {
  revalidatePath('/', 'layout')
}

/** Tipo novo entra no fim da lista. */
export async function createExpenseType(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = expenseTypeSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data: last, error: lastError } = await supabase
    .from('property_expense_types')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastError) return { ok: false, error: translateError(lastError) }

  const { data, error } = await supabase
    .from('property_expense_types')
    .insert({
      household_id: household.id,
      name: parsed.data.name,
      typical_phase: parsed.data.typicalPhase,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateExpenseType(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = expenseTypeSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('property_expense_types')
    .update({ name: parsed.data.name, typical_phase: parsed.data.typicalPhase })
    .eq('id', parsedId.data)
    .select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: translateError({ message: 'INVALID_EXPENSE_TYPE' }) }
  done()
  return { ok: true, data: null }
}

export async function setExpenseTypeArchived(id: unknown, archived: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success || typeof archived !== 'boolean') return { ok: false, error: GENERIC_ERROR }
  const supabase = await createClient()
  const { data, error } = await supabase.from('property_expense_types').update({ archived }).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: translateError({ message: 'INVALID_EXPENSE_TYPE' }) }
  done()
  return { ok: true, data: null }
}
