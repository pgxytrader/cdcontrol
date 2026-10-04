import { Landmark, PiggyBank, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { createElement } from 'react'
import type { AccountType } from '@/lib/validation/account'

const ICONS: Record<AccountType, LucideIcon> = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Wallet,
  investment: TrendingUp,
}

export function AccountTypeIcon({ type, className }: { type: AccountType; className?: string }) {
  return createElement(ICONS[type], { className, 'aria-hidden': true })
}
