// APP_URL é injetada em runtime pelo EasyPanel (env var, não build arg),
// portanto nunca contém "localhost" de build antigo.
// Não derivamos a URL de request headers para evitar Host Header Injection
// (password reset poisoning): um atacante não pode influenciar o redirectTo
// manipulando o header Host.
export function getAppUrl(): string {
  const url = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  if (!url) throw new Error('APP_URL env var não configurada')
  return url
}
