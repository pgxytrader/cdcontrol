import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Sidebar } from '@/components/layout/sidebar'
import { TransactionFormDataProvider, type TransactionFormData } from '@/components/transactions/form-data-context'
import { listAccounts } from '@/lib/accounts'
import { listCardOptions } from '@/lib/cards'
import { listCategories, topCategoryIds } from '@/lib/categories-query'
import { todayISO } from '@/lib/dates'
import { getCurrentHousehold } from '@/lib/household'
import { getMyProfile } from '@/lib/profile'
import { syncRecurrences } from '@/lib/recurrences-sync'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const household = await getCurrentHousehold()
  if (!household) redirect('/bem-vindo')

  // Gera os lançamentos recorrentes que faltam antes de carregar os dados (PRD 8.6)
  await syncRecurrences(todayISO())

  const [accounts, cards, categories, topExpense, topIncome, profile] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listCardOptions(),
    listCategories(),
    topCategoryIds('expense'),
    topCategoryIds('income'),
    getMyProfile(),
  ])

  const formData: TransactionFormData = {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      color: account.color,
      archived: account.archived,
      initialBalanceDate: account.initialBalanceDate,
    })),
    cards,
    categories,
    topCategoryIds: { expense: topExpense, income: topIncome },
    lastAccountId: profile?.last_account_id ?? null,
    lastCreditCardId: profile?.last_credit_card_id ?? null,
  }

  return (
    <TransactionFormDataProvider value={formData}>
      <div className="min-h-dvh lg:flex">
        <Sidebar householdName={household.name} />
        <main className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-10">
          <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 lg:px-8 lg:pt-8">{children}</div>
        </main>
        <BottomNav />
      </div>
    </TransactionFormDataProvider>
  )
}
