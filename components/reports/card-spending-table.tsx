import { formatMonthShort } from '@/lib/finance/periods'
import type { CardMonthly } from '@/lib/finance/reports'
import { formatBRL } from '@/lib/finance/money'

function Rows({ data }: { data: CardMonthly }) {
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Mês</th>
              {data.cards.map((card) => (
                <th key={card.id} className="py-1 text-right font-normal">
                  {card.name}
                </th>
              ))}
              <th className="py-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.months.map((month) => (
              <tr key={month.key} className="border-t border-border">
                <td className="py-1.5">{formatMonthShort(month.ym)}</td>
                {data.cards.map((card) => (
                  <td key={card.id} className="py-1.5 text-right">
                    {formatBRL(month.byCard[card.id] ?? 0)}
                  </td>
                ))}
                <td className="py-1.5 text-right font-medium">{formatBRL(month.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border text-sm sm:hidden">
        {data.months.map((month) => (
          <li key={month.key} className="py-2">
            <p className="flex justify-between font-medium">
              <span>{formatMonthShort(month.ym)}</span>
              <span className="tabular-nums">{formatBRL(month.totalCents)}</span>
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {data.cards.map((card) => `${card.name} ${formatBRL(month.byCard[card.id] ?? 0)}`).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}

export function CardSpendingTable({ data }: { data: CardMonthly }) {
  return (
    <>
      <div className="hidden lg:block">
        <Rows data={data} />
      </div>
      <details className="lg:hidden">
        <summary className="cursor-pointer text-sm text-primary">Ver tabela</summary>
        <div className="mt-2">
          <Rows data={data} />
        </div>
      </details>
    </>
  )
}
