'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { revogarMobilizador } from '@/actions/admin/revogar-mobilizador'

export default function RevogarMobilizadorTopButton({
  slug,
  pessoaId,
  nome,
  corPrimaria,
}: {
  slug: string
  pessoaId: string
  nome: string
  corPrimaria: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm(`Revogar o status de mobilizador de ${nome}? A rede dela deixa de existir, mas o cadastro continua no sistema.`)) return
    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('pessoaId', pessoaId)
    startTransition(async () => {
      await revogarMobilizador(formData)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      style={{ backgroundColor: '#fff', color: corPrimaria, border: `1px solid ${corPrimaria}` }}
      className="text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium disabled:opacity-50"
    >
      {isPending ? 'Revogando...' : 'Revogar Mobilizador'}
    </button>
  )
}
