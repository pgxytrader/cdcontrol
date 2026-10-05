import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { ExpenseFormButton } from '@/components/property/expense-form'
import { ExpensesTab } from '@/components/property/expenses-tab'
import { PlanFormButton } from '@/components/property/plan-form'
import { PropertyFormButton } from '@/components/property/property-form'
import { PropertyHeader } from '@/components/property/property-header'
import { PropertyTabs } from '@/components/property/property-tabs'
import { ScheduleTab } from '@/components/property/schedule-tab'
import { SummaryTab } from '@/components/property/summary-tab'
import { TypesTab } from '@/components/property/types-tab'
import { todayISO } from '@/lib/dates'
import { expenseStatus, propertySchedule, propertySummary, totalsByType } from '@/lib/finance/property'
import { listExpenseTypes, listProperties, listPropertyExpenses } from '@/lib/property'
import { filterExpenses, parsePropertyQuery, type PropertyQuery } from '@/lib/property-filters'

export const metadata: Metadata = { title: 'Imóvel' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function PropertyPage({ searchParams }: Props) {
  const query = parsePropertyQuery(await searchParams)
  const today = todayISO()
  const [properties, types] = await Promise.all([listProperties(), listExpenseTypes()])

  if (properties.length === 0) {
    return (
      <>
        <PageHeader title="Imóvel" />
        <div className="space-y-4 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-muted-foreground">Cadastre o imóvel para acompanhar os gastos.</p>
          <PropertyFormButton label="Cadastrar imóvel" variant="default" />
        </div>
      </>
    )
  }

  const property = properties.find((item) => item.id === query.propertyId) ?? properties[0]
  const current: PropertyQuery = { ...query, propertyId: property.id }
  const expenses = await listPropertyExpenses(property.id)
  const typeName = new Map(types.map((type) => [type.id, type.name]))
  const summary = propertySummary(property.purchasePriceCents, expenses, new Map(types.map((type) => [type.id, type.systemKey])))
  const counts = { expenses: expenses.length, linked: expenses.filter((expense) => expense.transactionId).length }

  return (
    <>
      <PageHeader title="Imóvel" />
      <PropertyHeader
        properties={properties.map((item) => ({ id: item.id, name: item.name }))}
        propertyId={property.id}
        query={current}
        actions={
          <>
            <ExpenseFormButton propertyId={property.id} types={types} today={today} />
            <PlanFormButton propertyId={property.id} today={today} />
            <PropertyFormButton label="Editar imóvel" property={property} counts={counts} />
            <PropertyFormButton label="Novo imóvel" variant="ghost" />
          </>
        }
      />
      <PropertyTabs query={current} />
      {current.tab === 'resumo' ? (
        <SummaryTab
          property={property}
          summary={summary}
          nextStatus={summary.next ? expenseStatus(summary.next, today) : null}
          typeName={(id) => typeName.get(id) ?? 'Tipo removido'}
        />
      ) : current.tab === 'gastos' ? (
        <ExpensesTab
          propertyId={property.id}
          expenses={filterExpenses(expenses, current.filters, today)}
          types={types}
          query={current}
          today={today}
          openExpense={current.expenseId ? (expenses.find((expense) => expense.id === current.expenseId) ?? null) : null}
        />
      ) : current.tab === 'cronograma' ? (
        <ScheduleTab months={propertySchedule(expenses, property.expectedDeliveryDate, today)} />
      ) : (
        <TypesTab totals={totalsByType(expenses, types)} />
      )}
    </>
  )
}
