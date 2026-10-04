import { describe, expect, it } from 'vitest'
import { fetchAllPages } from './fetch-all'

function fakeSource(total: number) {
  const calls: [number, number][] = []
  const items = Array.from({ length: total }, (_, i) => i)
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to])
    return { data: items.slice(from, to + 1), error: null }
  }
  return { calls, fetchPage }
}

describe('fetchAllPages', () => {
  it('junta todas as páginas além do limite de 1000 linhas', async () => {
    const { calls, fetchPage } = fakeSource(2500)
    const rows = await fetchAllPages(fetchPage)
    expect(rows).toHaveLength(2500)
    expect(rows.at(-1)).toBe(2499)
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('para quando a página vem vazia num múltiplo exato', async () => {
    const { calls, fetchPage } = fakeSource(2000)
    expect(await fetchAllPages(fetchPage)).toHaveLength(2000)
    expect(calls).toHaveLength(3)
  })

  it('propaga o erro da consulta', async () => {
    const failing = async () => ({ data: null, error: new Error('boom') })
    await expect(fetchAllPages(failing)).rejects.toThrow('boom')
  })
})
