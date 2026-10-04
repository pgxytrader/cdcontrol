import 'server-only'
import type { LedgerAccount } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'
import type { AccountType } from '@/lib/validation/account'

export type AccountWithBalance = {
  id: string
  name: string
  institution: string | null
  type: AccountType
  initialBalanceCents: number
  initialBalanceDate: string
  color: string
  archived: boolean
  balanceCents: number
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

type AccountRow = {
  id: string
  name: string
  institution: string | null
  type: string
  initial_balance_cents: number
  initial_balance_date: string
  color: string
  archived: boolean
}

const COLUMNS = 'id, name, institution, type, initial_balance_cents, initial_balance_date, color, archived'

async function loadBalances(supabase: SupabaseServer): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('v_account_balances').select('account_id, balance_cents')
  if (error) throw error
  const balances = new Map<string, number>()
  for (const row of data) if (row.account_id) balances.set(row.account_id, Number(row.balance_cents ?? 0))
  return balances
}

function toAccount(row: AccountRow, balances: Map<string, number>): AccountWithBalance {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    type: row.type as AccountType,
    initialBalanceCents: row.initial_balance_cents,
    initialBalanceDate: row.initial_balance_date,
    color: row.color,
    archived: row.archived,
    balanceCents: balances.get(row.id) ?? row.initial_balance_cents,
  }
}

export async function listAccounts({ includeArchived = false }: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const supabase = await createClient()
  let query = supabase.from('accounts').select(COLUMNS).order('name')
  if (!includeArchived) query = query.eq('archived', false)
  const [{ data, error }, balances] = await Promise.all([query, loadBalances(supabase)])
  if (error) throw error
  return data.map((row) => toAccount(row, balances))
}

export async function getAccount(id: string): Promise<AccountWithBalance | null> {
  const supabase = await createClient()
  const [{ data, error }, balances] = await Promise.all([
    supabase.from('accounts').select(COLUMNS).eq('id', id).maybeSingle(),
    loadBalances(supabase),
  ])
  if (error) throw error
  return data ? toAccount(data, balances) : null
}

export function toLedgerAccount(account: AccountWithBalance): LedgerAccount {
  return { id: account.id, initialBalanceCents: account.initialBalanceCents, initialBalanceDate: account.initialBalanceDate }
}
