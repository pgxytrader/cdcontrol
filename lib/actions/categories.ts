'use server'

import { revalidatePath } from 'next/cache'
import { invalidInput, type ActionResult } from '@/lib/action-result'
import { todayISO } from '@/lib/dates'
import { getCurrentHousehold } from '@/lib/household'
import { hasActiveRecurrence } from '@/lib/recurrence-server'
import { ARCHIVE_BLOCKED, GENERIC_ERROR, translateError } from '@/lib/supabase/errors'
import { createClient } from '@/lib/supabase/server'
import { categorySchema, categoryUpdateSchema } from '@/lib/validation/category'
import { uuidSchema } from '@/lib/validation/common'

function categoryError(error: { code?: string; message?: string }): string {
  return error.code === '23505' ? 'Já existe uma categoria com esse nome neste nível.' : translateError(error)
}

function done() {
  revalidatePath('/', 'layout')
}

export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const household = await getCurrentHousehold()
  if (!household) return { ok: false, error: translateError({ message: 'NO_HOUSEHOLD' }) }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .insert({
      household_id: household.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
      parent_id: parsed.data.parentId,
      icon: parsed.data.icon,
      color: parsed.data.color,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: categoryError(error) }

  done()
  return { ok: true, data: { id: data.id } }
}

export async function updateCategory(id: unknown, input: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }
  const parsed = categoryUpdateSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .update({ name: parsed.data.name, parent_id: parsed.data.parentId, icon: parsed.data.icon, color: parsed.data.color })
    .eq('id', parsedId.data)
    .select('id')
  if (error) return { ok: false, error: categoryError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function setCategoryArchived(id: unknown, archived: boolean): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  if (archived) {
    const active = await hasActiveRecurrence(supabase, 'category_id', parsedId.data, todayISO())
    if (active === null) return { ok: false, error: GENERIC_ERROR }
    if (active) return { ok: false, error: ARCHIVE_BLOCKED.category }
  }
  const { data, error } = await supabase.from('categories').update({ archived }).eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}

export async function deleteCategory(id: unknown): Promise<ActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: GENERIC_ERROR }

  const supabase = await createClient()
  const { data, error } = await supabase.from('categories').delete().eq('id', parsedId.data).select('id')
  if (error) return { ok: false, error: translateError(error) }
  if (data.length === 0) return { ok: false, error: GENERIC_ERROR }

  done()
  return { ok: true, data: null }
}
