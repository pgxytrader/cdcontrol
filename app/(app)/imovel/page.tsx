import type { Metadata } from 'next'
import { EmptyText } from '@/components/dashboard/panel'
import { PageHeader } from '@/components/layout/page-header'
import { PropertyFormButton } from '@/components/property/property-form'
import { PropertyHeader } from '@/components/property/property-header'
import { PropertyTabs } from '@/components/property/property-tabs'
import { SummaryTab } from '@/components/property/summary-tab'
import { todayISO } from '@/lib/dates'
import { expenseStatus, propertySummary } from '@/lib/finance/property'
import { listExpenseTypes, listProperties, listPropertyExpenses } from '@/lib/property'
import { parsePropertyQuery, type PropertyQuery } from '@/lib/property-filters'

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
      ) : (
        <EmptyText>Esta seção chega nas próximas etapas.</EmptyText>
      )}
    </>
  )
}
