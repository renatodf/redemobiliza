'use client'

import { useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import Modal from '@/components/admin/Modal'
import { cadastrarPessoa } from '@/actions/admin/cadastrar-pessoa'
import { corTextoContraste } from '@/lib/cor-contraste'
import { comprimirImagem } from '@/lib/comprimir-imagem'

export default function CadastrarUsuarioModal({
  slug,
  regioes,
  profissoes,
  corPrimaria,
}: {
  slug: string
  regioes: { id: string; nome: string }[]
  profissoes: { id: string; nome: string }[]
  corPrimaria: string
}) {
  const [open, setOpen] = useState(false)
  const corTexto = corTextoContraste(corPrimaria)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [comprimindo, setComprimindo] = useState(false)
  const inputFotoRef = useRef<HTMLInputElement>(null)
  const [state, action] = useFormState(cadastrarPessoa, {})

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return

    setComprimindo(true)
    try {
      const comprimido = await comprimirImagem(arquivo)
      if (inputFotoRef.current) {
        const dt = new DataTransfer()
        dt.items.add(comprimido)
        inputFotoRef.current.files = dt.files
      }
      setPreviewUrl(URL.createObjectURL(comprimido))
    } finally {
      setComprimindo(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ backgroundColor: corPrimaria, color: corTexto }}
        className="h-[42px] px-5 rounded-sm text-sm font-medium tracking-wide flex items-center gap-2.5 shadow-[0_12px_35px_rgba(212,212,212,0.6)]"
      >
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden className="shrink-0">
          <circle cx="6" cy="4" r="3" stroke={corTexto} strokeWidth="1.4" />
          <path d="M1 13c0-3 2.2-5 5-5s5 2 5 5" stroke={corTexto} strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <path d="M14 3v6M11 6h6" stroke={corTexto} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        CADASTRAR USUÁRIO
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Cadastrar usuário">
        <form action={action} encType="multipart/form-data" className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">Foto (opcional)</label>
            <div className="mt-1 flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center border border-gray-200">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Pré-visualização" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-300 text-2xl">👤</span>
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={inputFotoRef}
                  name="foto"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFotoChange}
                  className="block w-full text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {comprimindo
                    ? 'Reduzindo tamanho da imagem…'
                    : 'Imagem quadrada, mínimo 200×200px. Fotos grandes são reduzidas automaticamente.'}
                </p>
              </div>
            </div>
          </div>
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
          {state.erro && <p className="text-xs text-red-600">{state.erro}</p>}
          <button
            type="submit"
            style={{ backgroundColor: corPrimaria, color: corTexto }}
            className="w-full px-4 py-2 rounded-md text-sm font-medium"
          >
            Cadastrar
          </button>
        </form>
      </Modal>
    </>
  )
}
