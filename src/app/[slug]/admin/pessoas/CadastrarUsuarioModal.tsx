'use client'

import { useState } from 'react'
import Modal from '@/components/admin/Modal'
import { cadastrarPessoa } from '@/actions/admin/cadastrar-pessoa'

export default function CadastrarUsuarioModal({
  slug,
  regioes,
  profissoes,
}: {
  slug: string
  regioes: { id: string; nome: string }[]
  profissoes: { id: string; nome: string }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
      >
        <span aria-hidden>👤</span>
        CADASTRAR USUÁRIO
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Cadastrar usuário">
        <form action={cadastrarPessoa} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome *</label>
            <input name="nome" required className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">WhatsApp *</label>
              <input
                name="whatsapp"
                required
                placeholder="(61) 9 9999-9999"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">E-mail</label>
              <input name="email" type="email" className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Região</label>
              <select name="regiaoId" className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                <option value="">Selecionar...</option>
                {regioes.map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Profissão</label>
              <select name="profissaoId" className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                <option value="">Selecionar...</option>
                {profissoes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Gênero</label>
            <select name="genero" className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
              <option value="">Prefiro não informar</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <button type="submit" className="w-full bg-black text-white px-4 py-2 rounded-md text-sm font-medium">
            Cadastrar
          </button>
        </form>
      </Modal>
    </>
  )
}
