const MAX_DIGITS = 11

const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1.234,56" (sem "R$"). */
export function formatCentsPlain(cents: number): string {
  return plain.format(cents / 100)
}

/**
 * Máscara de valor em que os dígitos entram pela direita ("1234" → "12,34").
 * Ignora qualquer caractere que não seja dígito e limita a 11 dígitos.
 */
export function maskCurrencyInput(raw: string): { display: string; cents: number } {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS)
  if (digits === '') return { display: '', cents: 0 }
  const cents = Number(digits)
  return { display: formatCentsPlain(cents), cents }
}
