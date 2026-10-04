/** Limite de linhas por resposta do PostgREST (Supabase). */
export const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: unknown }

/**
 * Busca todas as páginas de uma consulta paginada com `.range(from, to)`.
 * A consulta precisa ter ordenação estável (ex.: terminar em `.order('id')`).
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}
