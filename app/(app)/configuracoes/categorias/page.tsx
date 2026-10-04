import type { Metadata } from 'next'
import Link from 'next/link'
import { CategoryFormButton } from '@/components/categories/category-form'
import { CategoryIcon } from '@/components/categories/category-icon'
import { CategoryRowActions } from '@/components/categories/category-row-actions'
import { PageHeader } from '@/components/layout/page-header'
import { buildCategoryTree, type Category, type CategoryIconName, type CategoryKind, type PaletteColor } from '@/lib/categories'
import { listCategories } from '@/lib/categories-query'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Categorias' }

function CategoryRow({ category, parents, hasChildren, child = false }: { category: Category; parents: Category[]; hasChildren: boolean; child?: boolean }) {
  return (
    <li className={cn('flex items-center gap-3 py-2', child && 'pl-8')}>
      <CategoryIcon name={category.icon} color={category.color} />
      <span className="min-w-0 flex-1 truncate">{category.name}</span>
      <CategoryFormButton
        label={`Editar ${category.name}`}
        iconOnly
        kind={category.kind}
        parents={parents.filter((p) => p.id !== category.id)}
        categoryId={category.id}
        hasChildren={hasChildren}
        initial={{
          name: category.name,
          parentId: category.parentId,
          icon: category.icon as CategoryIconName,
          color: category.color as PaletteColor,
        }}
      />
      <CategoryRowActions id={category.id} name={category.name} archived={category.archived} />
    </li>
  )
}

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams
  const kind: CategoryKind = tipo === 'receita' ? 'income' : 'expense'
  const categories = (await listCategories()).filter((c) => c.kind === kind)
  const active = categories.filter((c) => !c.archived)
  const archived = categories.filter((c) => c.archived)
  const tree = buildCategoryTree(active)
  const parents = active.filter((c) => !c.parentId)

  return (
    <>
      <div className="mb-2">
        <Link href="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ Configurações
        </Link>
      </div>
      <PageHeader title="Categorias" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Tipo de categoria" className="inline-flex rounded-lg bg-surface-2 p-1">
          {(['expense', 'income'] as const).map((value) => (
            <Link
              key={value}
              href={`/configuracoes/categorias?tipo=${value === 'income' ? 'receita' : 'despesa'}`}
              aria-current={kind === value ? 'page' : undefined}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium',
                kind === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value === 'income' ? 'Receita' : 'Despesa'}
            </Link>
          ))}
        </nav>
        <CategoryFormButton label="Nova categoria" kind={kind} parents={parents} />
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
        {tree.map((node) => (
          <li key={node.id}>
            <ul>
              <CategoryRow category={node} parents={parents} hasChildren={node.children.length > 0} />
              {node.children.map((child) => (
                <CategoryRow key={child.id} category={child} parents={parents} hasChildren={false} child />
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {archived.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground">Arquivadas ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface px-4 opacity-75">
            {archived.map((category) => (
              <CategoryRow key={category.id} category={category} parents={parents} hasChildren={false} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  )
}
