import 'server-only'
import type { Category, CategoryKind } from '@/lib/categories'
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
