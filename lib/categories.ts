export type CategoryKind = 'income' | 'expense'

export type Category = {
  id: string
  name: string
  kind: CategoryKind
  parentId: string | null
  icon: string
  color: string
  isDefault: boolean
  archived: boolean
}

export type CategoryNode = Category & { children: Category[] }

export const COLOR_PALETTE = [
  '#3b82f6',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#64748b',
  '#eab308',
] as const

export type PaletteColor = (typeof COLOR_PALETTE)[number]

export const COLOR_LABELS: Record<PaletteColor, string> = {
  '#3b82f6': 'Azul',
  '#22c55e': 'Verde',
  '#ef4444': 'Vermelho',
  '#f59e0b': 'Âmbar',
  '#a855f7': 'Roxo',
  '#ec4899': 'Rosa',
  '#14b8a6': 'Turquesa',
  '#f97316': 'Laranja',
  '#64748b': 'Cinza',
  '#eab308': 'Amarelo',
}

export const CATEGORY_ICONS = [
  'house',
  'shopping-cart',
  'utensils-crossed',
  'car',
  'heart-pulse',
  'graduation-cap',
  'gamepad-2',
  'repeat',
  'shirt',
  'paw-print',
  'gift',
  'plane',
  'building-2',
  'circle-ellipsis',
  'briefcase',
  'laptop',
  'trending-up',
  'undo-2',
  'wallet',
  'piggy-bank',
  'fuel',
  'bus',
  'baby',
  'dumbbell',
  'coffee',
  'smartphone',
  'wifi',
  'zap',
  'droplet',
  'wrench',
  'book-open',
  'film',
  'pill',
  'receipt',
] as const

export type CategoryIconName = (typeof CATEGORY_ICONS)[number]

/** Mesma lista da função SQL seed_default_categories (PRD 5.6). */
export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind; icon: CategoryIconName; color: PaletteColor }[] = [
  { name: 'Moradia', kind: 'expense', icon: 'house', color: '#3b82f6' },
  { name: 'Mercado', kind: 'expense', icon: 'shopping-cart', color: '#22c55e' },
  { name: 'Alimentação fora', kind: 'expense', icon: 'utensils-crossed', color: '#f97316' },
  { name: 'Transporte', kind: 'expense', icon: 'car', color: '#eab308' },
  { name: 'Saúde', kind: 'expense', icon: 'heart-pulse', color: '#ef4444' },
  { name: 'Educação', kind: 'expense', icon: 'graduation-cap', color: '#a855f7' },
  { name: 'Lazer', kind: 'expense', icon: 'gamepad-2', color: '#ec4899' },
  { name: 'Assinaturas', kind: 'expense', icon: 'repeat', color: '#14b8a6' },
  { name: 'Vestuário', kind: 'expense', icon: 'shirt', color: '#f59e0b' },
  { name: 'Pets', kind: 'expense', icon: 'paw-print', color: '#f97316' },
  { name: 'Presentes', kind: 'expense', icon: 'gift', color: '#ec4899' },
  { name: 'Viagem', kind: 'expense', icon: 'plane', color: '#3b82f6' },
  { name: 'Imóvel', kind: 'expense', icon: 'building-2', color: '#14b8a6' },
  { name: 'Outros', kind: 'expense', icon: 'circle-ellipsis', color: '#64748b' },
  { name: 'Salário', kind: 'income', icon: 'briefcase', color: '#22c55e' },
  { name: 'Freelance', kind: 'income', icon: 'laptop', color: '#3b82f6' },
  { name: 'Rendimentos', kind: 'income', icon: 'trending-up', color: '#14b8a6' },
  { name: 'Reembolso', kind: 'income', icon: 'undo-2', color: '#a855f7' },
  { name: 'Outros', kind: 'income', icon: 'circle-ellipsis', color: '#64748b' },
]

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'pt-BR')

/** Ids mais frequentes primeiro; empate pela primeira aparição. */
export function rankCategories(ids: (string | null)[], limit: number): string[] {
  const counts = new Map<string, { count: number; first: number }>()
  ids.forEach((id, index) => {
    if (!id) return
    const entry = counts.get(id)
    if (entry) entry.count += 1
    else counts.set(id, { count: 1, first: index })
  })
  return [...counts.entries()]
    .sort(([, a], [, b]) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map(([id]) => id)
}

export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const ids = new Set(categories.map((c) => c.id))
  const roots = categories.filter((c) => !c.parentId || !ids.has(c.parentId)).sort(byName)
  return roots.map((root) => ({
    ...root,
    children: categories.filter((c) => c.parentId === root.id).sort(byName),
  }))
}

/** Não arquivadas e sem mãe arquivada (o que aparece nos seletores). */
export function activeCategories(categories: Category[]): Category[] {
  const archived = new Set(categories.filter((c) => c.archived).map((c) => c.id))
  return categories.filter((c) => !c.archived && !(c.parentId && archived.has(c.parentId)))
}

/** O filtro por uma categoria-mãe inclui as subcategorias. */
export function expandCategoryFilter(categoryId: string, categories: Category[]): string[] {
  return [categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)]
}

/** Chips do formulário: as mais usadas que ainda são candidatas, completadas em ordem alfabética. */
export function chipCategories(candidates: Category[], topIds: string[], limit: number): Category[] {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const top = topIds.map((id) => byId.get(id)).filter((c): c is Category => Boolean(c))
  const rest = [...candidates].sort(byName).filter((c) => !top.includes(c))
  return [...top, ...rest].slice(0, limit)
}
