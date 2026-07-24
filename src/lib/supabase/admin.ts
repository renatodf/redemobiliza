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

type ParametrosGenerateLink = Parameters<
  ReturnType<typeof getSupabaseAdmin>['auth']['admin']['generateLink']
>[0]

/**
 * generateLink falha de forma intermitente com "bad_jwt" (falha transitória
 * de verificação de chave JWT no lado do Supabase, não relacionada aos
 * parâmetros da chamada) — tentar de novo antes de propagar o erro.
 */
export async function gerarLinkComRetry(
  params: ParametrosGenerateLink,
  tentativas = 3
) {
  let resultado = await getSupabaseAdmin().auth.admin.generateLink(params)
  for (
    let tentativa = 1;
    tentativa < tentativas && resultado.error?.code === 'bad_jwt';
    tentativa++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    resultado = await getSupabaseAdmin().auth.admin.generateLink(params)
  }
  return resultado
}
