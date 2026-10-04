import 'server-only'
import { rankCategories, type Category, type CategoryKind } from '@/lib/categories'
import { addDaysISO, todayISO } from '@/lib/dates'
import { createClient } from '@/lib/supabase/server'

type CategoryRow = {
  id: string
  name: string
  kind: string
  parent_id: string | null
  icon: string
  color: string
  is_default: boolean
  archived: boolean
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CategoryKind,
    parentId: row.parent_id,
    icon: row.icon,
    color: row.color,
    isDefault: row.is_default,
    archived: row.archived,
  }
}

/** Todas as categorias da casa (inclusive arquivadas), em ordem alfabética. */
export async function listCategories(): Promise<Category[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, kind, parent_id, icon, color, is_default, archived')
    .order('name')
  if (error) throw error
  return data.map(toCategory)
}

/** Categorias mais usadas do tipo nos últimos 90 dias (chips do formulário). */
export async function topCategoryIds(kind: CategoryKind, limit = 6): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('category_id')
    .eq('type', kind)
    .gte('date', addDaysISO(todayISO(), -90))
    .order('date', { ascending: false })
    .limit(500)
  if (error) throw error
  return rankCategories(
    data.map((row) => row.category_id),
    limit,
  )
}
