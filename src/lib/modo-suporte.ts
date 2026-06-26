export type SuporteSessao = {
  gabineteId: string
  sessaoId: string
}

export function readSuporteSessao(
  role: string | undefined,
  cookieValue: string | undefined
): SuporteSessao | null {
  if (role !== 'super-admin') {
    throw new Error('readSuporteSessao: role inválido — acesso negado')
  }
  if (!cookieValue) return null

  const parsed = JSON.parse(cookieValue) as Record<string, unknown>
  const { gabineteId, sessaoId } = parsed

  if (!gabineteId || !sessaoId) {
    throw new Error('cookie suporteSessao malformado')
  }

  return {
    gabineteId: gabineteId as string,
    sessaoId: sessaoId as string,
  }
}
