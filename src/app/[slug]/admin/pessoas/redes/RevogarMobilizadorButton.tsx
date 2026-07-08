'use client'

import { revogarMobilizador } from '@/actions/admin/revogar-mobilizador'
import { IconeExcluir } from '@/components/admin/TableIcons'

export default function RevogarMobilizadorButton({
  slug,
  pessoaId,
  nome,
}: {
  slug: string
  pessoaId: string
  nome: string
}) {
  async function acao(formData: FormData) {
    await revogarMobilizador(formData)
  }

  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!confirm(`Remover ${nome} como mobilizador? A rede dela deixa de existir, mas o cadastro continua no sistema.`)) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <button type="submit" aria-label={`Remover ${nome} como mobilizador`}>
        <IconeExcluir />
      </button>
    </form>
  )
}
