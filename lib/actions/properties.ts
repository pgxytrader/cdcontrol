// lib/actions/properties.ts
'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { getCurrentHousehold } from '@/lib/household'
import { propertyColumns } from '@/lib/property-rpc'
import { GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation/common'
import { propertySchema } from '@/lib/validation/property'

function done() {
  revalidatePath('/', 'layout')
}

export async function createProperty(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = propertySchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('properties')
    .insert({ household_id: household.id, ...propertyColumns(parsed.data) })
    .select('id')
    .single()
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateProperty(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = propertySchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase.from('properties').update(propertyColumns(parsed.data)).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: translateError({ message: 'INVALID_PROPERTY' }) }
  done()
  return { ok: true, data: null }
}

/** Apaga o imóvel, os gastos e os lançamentos ligados (delete_property). Sem Desfazer. */
export async function deleteProperty(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_property', { p_property_id: parsedId.data })
  if (error) return { ok: false, error: translateError(error) }
  done()
  return { ok: true, data: null }
}
