import { EmptyText, Panel } from '@/components/dashboard/panel'
import { formatISODateBR } from '@/lib/dates'
import {
  AMORTIZATION_LABELS,
  FUNDING_LABELS,
  FUNDING_SOURCES,
  PROPERTY_PHASE_LABELS,
  type ExpenseStatus,
  type PropertySummary,
} from '@/lib/finance/property'
import { formatBRL, formatSignedBRL } from '@/lib/finance/money'
import type { PropertyRecord } from '@/lib/validation/property'
import { ProgressBar } from './progress-bar'
import { ExpenseStatusBadge } from './status-badge'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold break-words tabular-nums sm:text-lg">{value}</p>
    </div>
  )
}

type SummaryTabProps = {
  property: PropertyRecord
  summary: PropertySummary
  nextStatus: ExpenseStatus | null
  typeName: (typeId: string) => string
}

export function SummaryTab({ property, summary, nextStatus, typeName }: SummaryTabProps) {
  const percent = Math.round(summary.paidRatio * 100)
  const details: [string, string | null][] = [
    ['Construtora', property.developer],
    ['Unidade', property.unit],
    ['Endereço', property.address],
    ['Fase', PROPERTY_PHASE_LABELS[property.phase]],
    ['Contrato', property.contractDate ? formatISODateBR(property.contractDate) : null],
    ['Previsão das chaves', property.expectedDeliveryDate ? formatISODateBR(property.expectedDeliveryDate) : null],
    ['Banco', property.bank],
    ['Valor financiado', property.financedAmountCents !== null ? formatBRL(property.financedAmountCents) : null],
    ['Prazo', property.termMonths !== null ? `${property.termMonths} meses` : null],
    ['Amortização', property.amortizationSystem ? AMORTIZATION_LABELS[property.amortizationSystem] : null],
    ['Juros', property.annualInterestRate !== null ? `${String(property.annualInterestRate).replace('.', ',')}% ao ano` : null],
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Valor do imóvel" value={formatBRL(summary.purchasePriceCents)} />
        <Stat label="Total previsto" value={formatBRL(summary.plannedCents)} />
        <Stat label="Total pago" value={formatBRL(summary.paidCents)} />
        <Stat label="A pagar" value={formatBRL(summary.toPayCents)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Progresso">
          <div className="space-y-2">
            <p className="flex items-baseline justify-between text-sm">
              <span>Pago</span>
              <span className="font-semibold tabular-nums">{percent}%</span>
            </p>
            <ProgressBar ratio={summary.paidRatio} label="Percentual pago" />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Correção INCC</dt>
              <dd className="tabular-nums">{formatSignedBRL(summary.inccCents)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Taxa de obra</dt>
              <dd className="tabular-nums">{formatBRL(summary.constructionInterestCents)}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Por fonte">
          <ul className="space-y-2 text-sm">
            {FUNDING_SOURCES.map((source) => (
              <li key={source} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>{FUNDING_LABELS[source]}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  pago {formatBRL(summary.bySource[source].paidCents)} · a pagar {formatBRL(summary.bySource[source].toPayCents)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Próximo pagamento">
          {summary.next && nextStatus ? (
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{summary.next.description}</span>
                <ExpenseStatusBadge status={nextStatus} />
              </p>
              <p className="text-xs text-muted-foreground">
                {typeName(summary.next.expenseTypeId)} · vence {formatISODateBR(summary.next.dueDate)}
              </p>
              <p className="font-semibold tabular-nums">{formatBRL(summary.next.plannedAmountCents)}</p>
            </div>
          ) : (
            <EmptyText>Nenhum pagamento pendente.</EmptyText>
          )}
        </Panel>
      </div>

      <Panel title="Dados do imóvel">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {details
            .filter((entry): entry is [string, string] => entry[1] !== null)
            .map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
        </dl>
      </Panel>
    </div>
  )
}
