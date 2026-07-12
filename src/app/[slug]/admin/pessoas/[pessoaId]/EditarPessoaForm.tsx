'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useState } from 'react'
import { editarPessoa } from '@/actions/admin/editar-pessoa'
import { corTextoContraste } from '@/lib/cor-contraste'
import CamposPessoa, { type PessoaCampos } from './CamposPessoa'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }

interface Props {
  slug: string
  pessoaId: string
  pessoa: PessoaCampos
  regioes: Regiao[]
  profissoes: Profissao[]
  corPrimaria: string
}

function SubmitButton({ ok, corPrimaria }: { ok: boolean | null; corPrimaria: string }) {
  const { pending } = useFormStatus()
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        style={{ backgroundColor: corPrimaria, color: corTextoContraste(corPrimaria) }}
        className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60"
      >
        {pending ? 'Salvando…' : 'Salvar alterações'}
      </button>
      {ok === true && (
        <span className="text-sm text-green-600 font-medium">✓ Salvo!</span>
      )}
      {ok === false && (
        <span className="text-sm text-red-600 font-medium">Erro ao salvar</span>
      )}
    </div>
  )
}

export default function EditarPessoaForm({ slug, pessoaId, pessoa, regioes, profissoes, corPrimaria }: Props) {
  const [state, action] = useFormState(editarPessoa, null)
  const [showFeedback, setShowFeedback] = useState(false)

  useEffect(() => {
    if (state === null) return
    setShowFeedback(true)
    const t = setTimeout(() => setShowFeedback(false), 3000)
    return () => clearTimeout(t)
  }, [state])

  const ok = showFeedback ? (state?.ok ?? null) : null

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <CamposPessoa pessoa={pessoa} regioes={regioes} profissoes={profissoes} />
      {state?.erro && (
        <p className="text-sm text-red-600">{state.erro}</p>
      )}
      <SubmitButton ok={ok} corPrimaria={corPrimaria} />
    </form>
  )
}
