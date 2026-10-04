const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Formata um valor inteiro em centavos como moeda brasileira (ex.: 123456 → "R$ 1.234,56"). */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

const WITH_COMMA = /^(\d{1,3}(?:\.\d{3})+|\d*),(\d{1,2})$/
const THOUSANDS_ONLY = /^\d{1,3}(?:\.\d{3})+$/
const DOT_DECIMAL = /^(\d+)\.(\d{1,2})$/
const INTEGER = /^\d+$/

/**
 * Converte o texto digitado pelo usuário em centavos.
 * Aceita "R$", vírgula decimal, ponto de milhar e, sem vírgula, ponto decimal com 1–2 casas.
 * Retorna null para entradas inválidas.
 */
export function parseBRL(input: string): number | null {
  let value = input.replace(/R\$/gi, '').replace(/[\s\u00a0]/g, '')
  let negative = false
  if (value.startsWith('-')) {
    negative = true
    value = value.slice(1)
  }
  if (value === '') return null

  let integerPart: string
  let fractionPart: string
  let match: RegExpExecArray | null

  if ((match = WITH_COMMA.exec(value))) {
    integerPart = match[1].replace(/\./g, '')
    fractionPart = match[2]
  } else if (THOUSANDS_ONLY.test(value)) {
    integerPart = value.replace(/\./g, '')
    fractionPart = ''
  } else if ((match = DOT_DECIMAL.exec(value))) {
    integerPart = match[1]
    fractionPart = match[2]
  } else if (INTEGER.test(value)) {
    integerPart = value
    fractionPart = ''
  } else {
    return null
  }

  const cents = Number(integerPart || '0') * 100 + Number(fractionPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return negative && cents !== 0 ? -cents : cents
}

/** Valor com sinal explícito: "+ R$ 10,50", "− R$ 10,50" (U+2212) ou "R$ 0,00". */
export function formatSignedBRL(cents: number): string {
  if (cents === 0) return formatBRL(0)
  return `${cents > 0 ? '+' : '−'} ${formatBRL(Math.abs(cents))}`
}
