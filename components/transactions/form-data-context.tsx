'use client'

import { createContext, useContext } from 'react'
import type { Category, CategoryKind } from '@/lib/categories'

export type AccountOption = { id: string; name: string; color: string; archived: boolean; initialBalanceDate: string }

export type TransactionFormData = {
  accounts: AccountOption[]
  categories: Category[]
  topCategoryIds: Record<CategoryKind, string[]>
  lastAccountId: string | null
}

const TransactionFormDataContext = createContext<TransactionFormData | null>(null)

export function TransactionFormDataProvider({ value, children }: { value: TransactionFormData; children: React.ReactNode }) {
  return <TransactionFormDataContext.Provider value={value}>{children}</TransactionFormDataContext.Provider>
}

export function useTransactionFormData(): TransactionFormData {
  const value = useContext(TransactionFormDataContext)
  if (!value) throw new Error('useTransactionFormData precisa estar dentro de TransactionFormDataProvider')
  return value
}
