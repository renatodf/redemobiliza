import { getSupabaseAdmin } from './supabase/admin'

const VALIDADE_SEGUNDOS = 48 * 60 * 60

// Link assinado (não público) porque uma exportação de Pessoas pode
// conter dado sensível de centenas de pessoas de uma vez (telefone,
// endereço, PcD) — diferente de uma foto de perfil individual, o risco
// de um link permanente vazando é maior aqui.
export async function uploadExportacaoESaerAssinada(
  gabineteId: string,
  exportId: string,
  extensao: string,
  contentType: string,
  buffer: Buffer
): Promise<string> {
  const path = `${gabineteId}/exports/${exportId}.${extensao}`
  const { error } = await getSupabaseAdmin()
    .storage.from('gabinete-assets')
    .upload(path, buffer, { contentType })
  if (error) throw new Error(`Falha ao subir arquivo de exportação: ${error.message}`)

  const { data, error: erroAssinatura } = await getSupabaseAdmin()
    .storage.from('gabinete-assets')
    .createSignedUrl(path, VALIDADE_SEGUNDOS)
  if (erroAssinatura || !data) {
    throw new Error(`Falha ao gerar link assinado: ${erroAssinatura?.message ?? 'sem dados retornados'}`)
  }
  return data.signedUrl
}
