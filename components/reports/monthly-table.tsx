import { formatMonthShort } from '@/lib/finance/periods'
import type { MonthPoint } from '@/lib/finance/reports'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'

function Rows({ points }: { points: MonthPoint[] }) {
  return (
    <>
      {/* Desktop: tabela */}
      <table className="hidden w-full text-sm sm:table">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 text-left font-normal">Mês</th>
            <th className="py-1 text-right font-normal">Receitas</th>
            <th className="py-1 text-right font-normal">Despesas</th>
            <th className="py-1 text-right font-normal">Saldo</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {points.map((point) => (
            <tr key={point.key} className="border-t border-border">
              <td className="py-1.5">{formatMonthShort(point.ym)}</td>
              <td className="py-1.5 text-right">{formatBRL(point.income.paid + point.income.pending)}</td>
              <td className="py-1.5 text-right">{formatBRL(point.expense.paid + point.expense.pending)}</td>
              <td className="py-1.5 text-right">{formatSignedBRL(point.balanceProjected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Celular: lista */}
      <ul className="divide-y divide-border text-sm sm:hidden">
        {points.map((point) => (
          <li key={point.key} className="py-2">
            <p className="font-medium">{formatMonthShort(point.ym)}</p>
            <dl className="grid grid-cols-3 gap-2 text-xs tabular-nums">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Receitas</dt>
                <dd className="[overflow-wrap:anywhere]">{formatBRL(point.income.paid + point.income.pending)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Despesas</dt>
                <dd className="[overflow-wrap:anywhere]">{formatBRL(point.expense.paid + point.expense.pending)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Saldo</dt>
                <dd className="[overflow-wrap:anywhere]">{formatSignedBRL(point.balanceProjected)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Visível no desktop; no celular fica atrás de "Ver tabela". Valores com previstos. */
export function MonthlyTable({ points }: { points: MonthPoint[] }) {
  return (
    <>
      <div className="hidden lg:block">
        <Rows points={points} />
      </div>
      <details className="lg:hidden">
        <summary className="cursor-pointer text-sm text-primary">Ver tabela</summary>
        <div className="mt-2">
          <Rows points={points} />
        </div>
      </details>
    </>
  )
}
