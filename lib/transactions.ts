import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { TRANSACTION_COLUMNS, type TransactionRow } from '@/lib/transaction-mappers'

/** Todos os lançamentos que envolvem a conta (origem ou destino), em ordem cronológica. `accountId` já validado como uuid. */
export async function listAccountTransactions(accountId: string): Promise<TransactionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .or(`account_id.eq.${accountId},destination_account_id.eq.${accountId}`)
    .order('date')
    .order('created_at')
  if (error) throw error
  return data as TransactionRow[]
}
