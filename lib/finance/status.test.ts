import { describe, expect, it } from 'vitest'
import { defaultStatus } from './status'

describe('defaultStatus', () => {
  it('hoje ou passado é pago', () => {
    expect(defaultStatus('2026-10-04', '2026-10-04')).toBe('paid')
    expect(defaultStatus('2026-09-30', '2026-10-04')).toBe('paid')
  })

  it('futuro é pendente', () => {
    expect(defaultStatus('2026-10-05', '2026-10-04')).toBe('pending')
    expect(defaultStatus('2027-01-01', '2026-12-31')).toBe('pending')
  })
})
