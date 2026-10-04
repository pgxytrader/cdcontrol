'use client'

import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NativeSelect } from '@/components/form/native-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { buildCategoryTree, type Category } from '@/lib/categories'
import type { TransactionStatus, TransactionType } from '@/lib/finance/types'
import { buildTransactionsHref, hasActiveFilters, type TransactionFilters, type TransactionsQuery } from '@/lib/transaction-filters'

type ToolbarProps = {
  query: TransactionsQuery
  categories: Category[]
  accounts: { id: string; name: string; archived: boolean }[]
}

function FilterControls({ query, categories, accounts, onChange }: ToolbarProps & { onChange: (filters: TransactionFilters) => void }) {
  const { filters } = query
  const set = (patch: TransactionFilters) => onChange({ ...filters, ...patch })
  const expenseTree = buildCategoryTree(categories.filter((c) => c.kind === 'expense'))
  const incomeTree = buildCategoryTree(categories.filter((c) => c.kind === 'income'))

  return (
    <>
      <NativeSelect aria-label="Tipo" value={filters.type ?? ''} onChange={(e) => set({ type: (e.target.value || undefined) as TransactionType | undefined })}>
        <option value="">Todos os tipos</option>
        <option value="expense">Despesas</option>
        <option value="income">Receitas</option>
        <option value="transfer">Transferências</option>
      </NativeSelect>
      <NativeSelect aria-label="Categoria" value={filters.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || undefined })}>
        <option value="">Todas as categorias</option>
        {[
          { label: 'Despesas', tree: expenseTree },
          { label: 'Receitas', tree: incomeTree },
        ].map(({ label, tree }) => (
          <optgroup key={label} label={label}>
            {tree.flatMap((node) => [
              <option key={node.id} value={node.id}>
                {node.name}
              </option>,
              ...node.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {`— ${child.name}`}
                </option>
              )),
            ])}
          </optgroup>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Conta" value={filters.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })}>
        <option value="">Todas as contas</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.archived ? `${account.name} (arquivada)` : account.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Status" value={filters.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as TransactionStatus | undefined })}>
        <option value="">Pagos e pendentes</option>
        <option value="paid">Pagos</option>
        <option value="pending">Pendentes</option>
      </NativeSelect>
    </>
  )
}

export function TransactionsToolbar({ query, categories, accounts }: ToolbarProps) {
  const router = useRouter()
  const [text, setText] = useState(query.q)
  const active = hasActiveFilters(query.filters)
  const activeCount = Object.values(query.filters).filter(Boolean).length

  useEffect(() => {
    if (text.trim() === query.q) return
    const timer = setTimeout(() => router.replace(buildTransactionsHref(query, { q: text.trim() })), 300)
    return () => clearTimeout(timer)
  }, [text, query, router])

  const applyFilters = (filters: TransactionFilters) => router.replace(buildTransactionsHref(query, { filters }))

  return (
    <div className="mb-6 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Buscar em todos os meses"
            aria-label="Buscar por descrição"
            className="pl-8"
          />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="lg:hidden">
              <SlidersHorizontal aria-hidden />
              Filtros{activeCount ? ` (${activeCount})` : ''}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription className="sr-only">Filtrar lançamentos</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 px-4">
              <FilterControls query={query} categories={categories} accounts={accounts} onChange={applyFilters} />
              {active ? (
                <Button variant="ghost" onClick={() => applyFilters({})}>
                  Limpar filtros
                </Button>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="hidden gap-2 lg:grid lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <FilterControls query={query} categories={categories} accounts={accounts} onChange={applyFilters} />
        <Button variant="ghost" onClick={() => applyFilters({})} disabled={!active}>
          <X aria-hidden />
          Limpar
        </Button>
      </div>
    </div>
  )
}
