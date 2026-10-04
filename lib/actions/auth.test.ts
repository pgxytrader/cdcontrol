import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOutMock = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signOut: signOutMock } }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { signOut } from './auth'

describe('signOut', () => {
  beforeEach(() => signOutMock.mockClear())

  it('encerra só a sessão deste aparelho', async () => {
    await signOut()
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' })
  })
})
