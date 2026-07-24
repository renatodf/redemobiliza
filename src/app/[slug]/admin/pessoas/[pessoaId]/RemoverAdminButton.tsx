'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removerAdmin } from '@/actions/admin/remover-admin'
import { IconeExcluir } from '@/components/admin/TableIcons'

export default function RemoverAdminButton({
  slug,
  pessoaId,
  nome,
  corPrimaria,
  iconOnly = false,
}: {
  slug: string
  pessoaId: string
  nome: string
  corPrimaria?: string
  iconOnly?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm(`Remover o acesso de administrador de ${nome}?`)) return
    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('pessoaId', pessoaId)
    startTransition(async () => {
      await removerAdmin(formData)
      router.refresh()
    })
  }

  if (iconOnly) {
    return (
      <button type="button" onClick={handleClick} disabled={isPending} aria-label={`Remover admin ${nome}`}>
        <IconeExcluir />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      style={corPrimaria ? { backgroundColor: '#fff', color: corPrimaria, border: `1px solid ${corPrimaria}` } : undefined}
      className="text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium disabled:opacity-50"
    >
      {isPending ? 'Removendo...' : 'Remover admin'}
    </button>
  )
}
