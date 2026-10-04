import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { supabaseEnv } from './env'

export function createBrowserSupabase() {
  return createBrowserClient<Database>(supabaseEnv.url, supabaseEnv.publishableKey)
}
