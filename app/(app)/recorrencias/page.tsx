import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { RecurrenceList } from '@/components/recurrences/recurrence-list'
import { todayISO } from '@/lib/dates'
import { listRecurrences } from '@/lib/recurrences'

export const metadata: Metadata = { title: 'Recorrências' }

export default async function RecurrencesPage() {
  const { active, ended } = await listRecurrences(todayISO())
  return (
    <>
      <PageHeader title="Recorrências" />
      <RecurrenceList active={active} ended={ended} />
    </>
  )
}
