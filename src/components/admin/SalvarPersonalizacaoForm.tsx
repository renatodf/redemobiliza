'use client'

import { useFormState } from 'react-dom'

interface SalvarPersonalizacaoFormProps {
  slug: string
  nomeSistema: string
  corPrimaria: string
  corSecundaria: string
  acao: (prevState: { erro?: string }, formData: FormData) => Promise<{ erro?: string }>
  botaoStyle?: React.CSSProperties
  botaoClassName?: string
}

const BOTAO_CLASSNAME_PADRAO = 'bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50'

export default function SalvarPersonalizacaoForm({
  slug,
  nomeSistema,
  corPrimaria,
  corSecundaria,
  acao,
  botaoStyle,
  botaoClassName = BOTAO_CLASSNAME_PADRAO,
}: SalvarPersonalizacaoFormProps) {
  const [state, action] = useFormState(acao, {})

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome do sistema</label>
        <input
          name="nomeSistema"
          defaultValue={nomeSistema}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          placeholder="Ex: Mobiliza Fulano"
        />
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Cor primária</label>
          <input
            name="corPrimaria"
            type="color"
            defaultValue={corPrimaria}
            className="mt-1 h-10 w-full border border-gray-300 rounded-md"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Cor secundária</label>
          <input
            name="corSecundaria"
            type="color"
            defaultValue={corSecundaria}
            className="mt-1 h-10 w-full border border-gray-300 rounded-md"
          />
        </div>
      </div>
      <button type="submit" style={botaoStyle} className={botaoClassName}>
        Salvar
      </button>
      {state.erro && <p className="text-xs text-red-600">{state.erro}</p>}
    </form>
  )
}
