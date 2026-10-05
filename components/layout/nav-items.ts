import {
  Building2,
  ChartColumn,
  CreditCard,
  House,
  Layers,
  PiggyBank,
  ReceiptText,
  Repeat,
  Settings,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV = {
  inicio: { href: '/inicio', label: 'Início', icon: House },
  lancamentos: { href: '/lancamentos', label: 'Lançamentos', icon: ReceiptText },
  cartoes: { href: '/cartoes', label: 'Cartões', icon: CreditCard },
  parcelas: { href: '/parcelas', label: 'Parcelas', icon: Layers },
  recorrencias: { href: '/recorrencias', label: 'Recorrências', icon: Repeat },
  contas: { href: '/contas', label: 'Contas', icon: Wallet },
  imovel: { href: '/imovel', label: 'Imóvel', icon: Building2 },
  relatorios: { href: '/relatorios', label: 'Relatórios', icon: ChartColumn },
  orcamento: { href: '/orcamento', label: 'Orçamento', icon: PiggyBank },
  configuracoes: { href: '/configuracoes', label: 'Configurações', icon: Settings },
} satisfies Record<string, NavItem>

/** Itens do sheet "Mais" no celular (PRD 9.2). */
export const MORE_NAV: NavItem[] = [NAV.parcelas, NAV.recorrencias, NAV.contas, NAV.imovel, NAV.relatorios, NAV.orcamento, NAV.configuracoes]

/** Todos os itens, na ordem do menu lateral do desktop. */
export const ALL_NAV: NavItem[] = [NAV.inicio, NAV.lancamentos, NAV.cartoes, ...MORE_NAV]

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
