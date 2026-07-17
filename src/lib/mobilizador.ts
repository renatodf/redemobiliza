// Resolve um token de mobilizador (vindo de link público ?m=token ou do
// magic link de login) para a Pessoa mobilizadora ATIVA correspondente.
// Sempre filtra deletedAt: null — sem esse filtro, o token de um
// mobilizador soft-deletado continuaria resolvendo (soft-delete não zera
// tokenMobilizador/isMobilizador, só deletedAt), dando acesso ou atribuição
// de novos cadastros a uma pessoa que devia estar inacessível.
export function whereMobilizadorAtivoPorToken(gabineteId: string, token: string) {
  return {
    gabineteId,
    tokenMobilizador: token,
    isMobilizador: true,
    deletedAt: null,
  } as const
}
