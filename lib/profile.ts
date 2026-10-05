import 'server-only'
import { cache } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const getMyProfile = cache(async () => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name, last_account_id, last_credit_card_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  return data
})
