import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Sidebar } from '@/components/layout/sidebar'
import { TransactionFormDataProvider, type TransactionFormData } from '@/components/transactions/form-data-context'
import { listAccounts } from '@/lib/accounts'
import { listCategories, topCategoryIds } from '@/lib/categories-query'
import { getCurrentHousehold } from '@/lib/household'
import { getMyProfile } from '@/lib/profile'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const household = await getCurrentHousehold()
  if (!household) redirect('/bem-vindo')

  const [accounts, categories, topExpense, topIncome, profile] = await Promise.all([
    listAccounts({ includeArchived: true }),
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
    categories,
    topCategoryIds: { expense: topExpense, income: topIncome },
    lastAccountId: profile?.last_account_id ?? null,
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
