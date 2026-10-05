import { redirect } from 'next/navigation'
import { findExpenseByTransaction } from '@/lib/property'
import { uuidSchema } from '@/lib/validation/common'

type Props = { params: Promise<{ id: string }> }

/** Leva do lançamento ligado ao gasto do Imóvel (aba Gastos com o gasto aberto). */
export default async function PropertyTransactionRedirect({ params }: Props) {
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) redirect('/imovel')
  const found = await findExpenseByTransaction(id)
  if (!found) redirect('/imovel')
  redirect(`/imovel?imovel=${found.propertyId}&aba=gastos&gasto=${found.expenseId}`)
}
