import { cn } from '@/lib/utils'

export function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn('flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4', className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

export function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}
