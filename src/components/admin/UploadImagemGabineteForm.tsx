'use client'

import { useFormState } from 'react-dom'

interface UploadImagemGabineteFormProps {
  slug: string
  campo: 'logo' | 'banner'
  acao: (prevState: { erro?: string }, formData: FormData) => Promise<{ erro?: string }>
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
  const [state, action] = useFormState(acao, {})

  return (
    <form action={action} encType="multipart/form-data">
      <input type="hidden" name="slug" value={slug} />
      <input
        name={campo}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="block text-sm"
      />
      <button type="submit" style={botaoStyle} className={botaoClassName}>
        {botaoLabel}
      </button>
      {state.erro && <p className="text-xs text-red-600 mt-1">{state.erro}</p>}
    </form>
  )
}
