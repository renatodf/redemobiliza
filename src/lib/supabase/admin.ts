import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | undefined

// NUNCA expor este módulo ao client-side — importar apenas em Server Actions e Route Handlers
export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }
  return _admin
}
