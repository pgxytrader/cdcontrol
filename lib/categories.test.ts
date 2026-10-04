import { describe, expect, it } from 'vitest'
import {
  activeCategories,
  buildCategoryTree,
  CATEGORY_ICONS,
  chipCategories,
  COLOR_LABELS,
  COLOR_PALETTE,
  DEFAULT_CATEGORIES,
  expandCategoryFilter,
  rankCategories,
  type Category,
} from './categories'

function cat(partial: Partial<Category> & { id: string; name: string }): Category {
  return { kind: 'expense', parentId: null, icon: 'house', color: '#3b82f6', isDefault: false, archived: false, ...partial }
}

describe('constantes', () => {
  it('categorias padrão: 14 de despesa e 5 de receita, com ícone e cor válidos', () => {
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense')).toHaveLength(14)
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === 'income')).toHaveLength(5)
    for (const c of DEFAULT_CATEGORIES) {
      expect(CATEGORY_ICONS).toContain(c.icon)
      expect(COLOR_PALETTE).toContain(c.color)
    }
  })

  it('toda cor da paleta tem rótulo', () => {
    for (const color of COLOR_PALETTE) expect(COLOR_LABELS[color]).toBeTruthy()
  })
})

describe('rankCategories', () => {
  it('ordena por frequência e desempata pela primeira aparição', () => {
    expect(rankCategories(['b', 'a', 'b', null, 'c', 'a', 'b'], 2)).toEqual(['b', 'a'])
    expect(rankCategories(['x', 'y'], 6)).toEqual(['x', 'y'])
    expect(rankCategories([], 6)).toEqual([])
  })
})

describe('buildCategoryTree', () => {
  it('agrupa subcategorias sob a mãe, em ordem alfabética', () => {
    const tree = buildCategoryTree([
      cat({ id: 'm', name: 'Moradia' }),
      cat({ id: 'a', name: 'Aluguel', parentId: 'm' }),
      cat({ id: 'e', name: 'Energia', parentId: 'm' }),
      cat({ id: 'l', name: 'Lazer' }),
    ])
    expect(tree.map((n) => [n.name, n.children.map((c) => c.name)])).toEqual([
      ['Lazer', []],
      ['Moradia', ['Aluguel', 'Energia']],
    ])
  })

  it('subcategoria sem mãe na lista vira raiz', () => {
    const tree = buildCategoryTree([cat({ id: 'a', name: 'Aluguel', parentId: 'sumiu' })])
    expect(tree.map((n) => n.name)).toEqual(['Aluguel'])
  })
})

describe('activeCategories', () => {
  it('remove arquivadas e filhas de mãe arquivada', () => {
    const result = activeCategories([
      cat({ id: 'm', name: 'Moradia', archived: true }),
      cat({ id: 'a', name: 'Aluguel', parentId: 'm' }),
      cat({ id: 'l', name: 'Lazer' }),
      cat({ id: 'x', name: 'Velha', archived: true }),
    ])
    expect(result.map((c) => c.id)).toEqual(['l'])
  })
})

describe('expandCategoryFilter', () => {
  it('inclui as subcategorias da mãe', () => {
    const categories = [cat({ id: 'm', name: 'Moradia' }), cat({ id: 'a', name: 'Aluguel', parentId: 'm' }), cat({ id: 'l', name: 'Lazer' })]
    expect(expandCategoryFilter('m', categories)).toEqual(['m', 'a'])
    expect(expandCategoryFilter('a', categories)).toEqual(['a'])
  })
})

describe('chipCategories', () => {
  const candidates = [cat({ id: 'c', name: 'Casa' }), cat({ id: 'b', name: 'Bar' }), cat({ id: 'a', name: 'Academia' })]

  it('usa as mais usadas e completa em ordem alfabética', () => {
    expect(chipCategories(candidates, ['c'], 3).map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })

  it('ignora ids que não estão entre as candidatas e respeita o limite', () => {
    expect(chipCategories(candidates, ['zzz', 'b'], 2).map((c) => c.id)).toEqual(['b', 'a'])
  })
})
