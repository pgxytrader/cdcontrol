import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/** Usuário autenticado da requisição atual (validado no servidor do Supabase), ou null. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user
})
