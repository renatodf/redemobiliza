'use client'

import { useState } from 'react'
import { corTextoContraste } from '@/lib/cor-contraste'

export default function CopiarLinkButton({
  link,
  corPrimaria,
}: {
  link: string
  corPrimaria: string
}) {
  const [copiado, setCopiado] = useState(false)
  const corTexto = corTextoContraste(corPrimaria)

  async function copiar() {
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copiar}
      style={{ backgroundColor: corPrimaria, color: corTexto }}
      className="text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium shrink-0"
    >
      {copiado ? 'Copiado!' : 'Copiar link'}
    </button>
  )
}
