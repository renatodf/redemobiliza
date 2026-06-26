'use client'

import { useState, useTransition } from 'react'
import { verificarWhatsApp } from '@/actions/public/verificar-whatsapp'
import { submeterCadastro } from '@/actions/public/submeter-cadastro'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }

type Props = {
  slug: string
  segmentoSlug: string
  mobilizadorToken?: string
  regioes: Regiao[]
  profissoes: Profissao[]
}

type Passo = 'whatsapp' | 'dados' | 'confirmacao'

export default function CadastroForm({
  slug,
  segmentoSlug,
  mobilizadorToken,
  regioes,
  profissoes,
}: Props) {
  const [passo, setPasso] = useState<Passo>('whatsapp')
  const [whatsapp, setWhatsapp] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleVerificarWhatsApp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    startTransition(async () => {
      const resultado = await verificarWhatsApp(slug, whatsapp)
      if (resultado.erro) {
        setErro(resultado.erro)
        return
      }
      setPasso(resultado.existe ? 'confirmacao' : 'dados')
    })
  }

  function handleSubmeterDados(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const resultado = await submeterCadastro({
        slug,
        segmentoSlug,
        whatsapp,
        nome: fd.get('nome') as string,
        email: fd.get('email') as string,
        regiaoId: fd.get('regiaoId') as string,
        profissaoId: fd.get('profissaoId') as string,
        genero: fd.get('genero') as string,
        mobilizadorToken,
      })
      if (resultado && 'erro' in resultado) {
        setErro(resultado.erro)
      }
    })
  }

  function handleConfirmar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    startTransition(async () => {
      const resultado = await submeterCadastro({
        slug,
        segmentoSlug,
        whatsapp,
        nome: '',
        mobilizadorToken,
      })
      if (resultado && 'erro' in resultado) {
        setErro(resultado.erro)
      }
    })
  }

  return (
    <div>
      {erro && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {erro}
        </div>
      )}

      {passo === 'whatsapp' && (
        <form onSubmit={handleVerificarWhatsApp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              WhatsApp *
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              required
              placeholder="(61) 9 9999-9999"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Verificando...' : 'Continuar'}
          </button>
        </form>
      )}

      {passo === 'dados' && (
        <form onSubmit={handleSubmeterDados} className="space-y-4">
          <p className="text-sm text-gray-600">
            Preencha seus dados para concluir o cadastro.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome completo *</label>
            <input
              name="nome"
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">E-mail</label>
            <input
              name="email"
              type="email"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Gênero</label>
            <select
              name="genero"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Prefiro não informar</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          {regioes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Região</label>
              <select
                name="regiaoId"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Selecionar...</option>
                {regioes.map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            </div>
          )}
          {profissoes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Profissão</label>
              <select
                name="profissaoId"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Selecionar...</option>
                {profissoes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPasso('whatsapp')}
              className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? 'Enviando...' : 'Confirmar cadastro'}
            </button>
          </div>
        </form>
      )}

      {passo === 'confirmacao' && (
        <form onSubmit={handleConfirmar} className="space-y-4">
          <p className="text-sm text-gray-700">
            Este número já está cadastrado. Clique em confirmar para registrar sua participação neste evento.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPasso('whatsapp')}
              className="flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Não sou eu
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? 'Confirmando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
