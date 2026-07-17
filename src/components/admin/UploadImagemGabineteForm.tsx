'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface UploadImagemGabineteFormProps {
  slug: string
  campo: 'logo' | 'banner'
  acao: (formData: FormData) => Promise<void>
  botaoLabel: string
  botaoClassName?: string
  botaoStyle?: React.CSSProperties
}

const BOTAO_CLASSNAME_PADRAO = 'mt-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50'

export default function UploadImagemGabineteForm({
  slug,
  campo,
  acao,
  botaoLabel,
  botaoClassName = BOTAO_CLASSNAME_PADRAO,
  botaoStyle,
}: UploadImagemGabineteFormProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function handleEnviar() {
    const file = inputRef.current?.files?.[0]
    if (!file) return
    setErrorMsg(null)

    const formData = new FormData()
    formData.set('slug', slug)
    formData.set(campo, file)

    startTransition(async () => {
      try {
        await acao(formData)
        if (inputRef.current) inputRef.current.value = ''
        router.refresh()
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Erro ao enviar imagem')
      }
    })
  }

  return (
    <div>
      <input
        ref={inputRef}
        name={campo}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="block text-sm"
        disabled={isPending}
      />
      <button
        type="button"
        onClick={handleEnviar}
        disabled={isPending}
        style={botaoStyle}
        className={botaoClassName}
      >
        {isPending ? 'Enviando...' : botaoLabel}
      </button>
      {errorMsg && <p className="text-xs text-red-600 mt-1">{errorMsg}</p>}
    </div>
  )
}
