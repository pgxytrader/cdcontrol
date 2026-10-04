import {
  Baby,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Car,
  CircleEllipsis,
  Coffee,
  Droplet,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Laptop,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Undo2,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { createElement } from 'react'
import type { CategoryIconName } from '@/lib/categories'
import { cn } from '@/lib/utils'

export const CATEGORY_ICON_COMPONENTS: Record<CategoryIconName, LucideIcon> = {
  house: House,
  'shopping-cart': ShoppingCart,
  'utensils-crossed': UtensilsCrossed,
  car: Car,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  'gamepad-2': Gamepad2,
  repeat: Repeat,
  shirt: Shirt,
  'paw-print': PawPrint,
  gift: Gift,
  plane: Plane,
  'building-2': Building2,
  'circle-ellipsis': CircleEllipsis,
  briefcase: Briefcase,
  laptop: Laptop,
  'trending-up': TrendingUp,
  'undo-2': Undo2,
  wallet: Wallet,
  'piggy-bank': PiggyBank,
  fuel: Fuel,
  bus: Bus,
  baby: Baby,
  dumbbell: Dumbbell,
  coffee: Coffee,
  smartphone: Smartphone,
  wifi: Wifi,
  zap: Zap,
  droplet: Droplet,
  wrench: Wrench,
  'book-open': BookOpen,
  film: Film,
  pill: Pill,
  receipt: Receipt,
}

type CategoryIconProps = { name: string; color: string; className?: string }

/** Círculo com o ícone da categoria na cor dela (fundo a 15%). */
export function CategoryIcon({ name, color, className }: CategoryIconProps) {
  const icon = CATEGORY_ICON_COMPONENTS[name as CategoryIconName] ?? CircleEllipsis
  return (
    <span
      aria-hidden
      className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full', className)}
      style={{ backgroundColor: `${color}26`, color }}
    >
      {createElement(icon, { className: 'size-4' })}
    </span>
  )
}
