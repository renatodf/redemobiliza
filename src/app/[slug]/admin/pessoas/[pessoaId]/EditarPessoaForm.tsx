'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useState } from 'react'
import { editarPessoa } from '@/actions/admin/editar-pessoa'
import { corTextoContraste } from '@/lib/cor-contraste'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }

interface Props {
  slug: string
  pessoaId: string
  pessoa: {
    nome: string
    whatsapp: string
    email: string | null
    regiaoId: string | null
    profissaoId: string | null
    genero: string | null
  }
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
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome *</label>
        <input
          name="nome"
          required
          defaultValue={pessoa.nome}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">WhatsApp *</label>
          <input
            name="whatsapp"
            required
            defaultValue={pessoa.whatsapp}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">E-mail</label>
          <input
            name="email"
            type="email"
            defaultValue={pessoa.email ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Região</label>
          <select
            name="regiaoId"
            defaultValue={pessoa.regiaoId ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar...</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Profissão</label>
          <select
            name="profissaoId"
            defaultValue={pessoa.profissaoId ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar...</option>
            {profissoes.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Gênero</label>
        <select
          name="genero"
          defaultValue={pessoa.genero ?? ''}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="">Não informado</option>
          <option value="masculino">Masculino</option>
          <option value="feminino">Feminino</option>
          <option value="outro">Outro</option>
        </select>
      </div>
      {state?.erro && (
        <p className="text-sm text-red-600">{state.erro}</p>
      )}
      <SubmitButton ok={ok} corPrimaria={corPrimaria} />
    </form>
  )
}
