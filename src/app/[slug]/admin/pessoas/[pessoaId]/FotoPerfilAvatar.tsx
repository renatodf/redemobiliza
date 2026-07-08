'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { uploadFotoPessoa } from '@/actions/admin/upload-foto-pessoa'
import { removerFotoPessoa } from '@/actions/admin/remover-foto-pessoa'

interface FotoPerfilAvatarProps {
  fotoUrl: string | null
  pessoaId: string
  slug: string
  canEdit: boolean
}

export default function FotoPerfilAvatar({ fotoUrl, pessoaId, slug, canEdit }: FotoPerfilAvatarProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function handleAvatarClick() {
    if (fotoUrl) {
      setLightboxOpen(true)
    } else if (canEdit) {
      inputRef.current?.click()
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorMsg(null)
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('pessoaId', pessoaId)
    formData.set('foto', file)

    startTransition(async () => {
      try {
        await uploadFotoPessoa(formData)
        router.refresh()
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Erro ao enviar foto')
      }
    })
  }

  function handleRemover() {
    setMenuAberto(false)
    if (!confirm('Remover a foto de perfil?')) return
    setErrorMsg(null)
    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('pessoaId', pessoaId)

    startTransition(async () => {
      try {
        await removerFotoPessoa(formData)
        router.refresh()
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Erro ao remover foto')
      }
    })
  }

  const isClickable = !!fotoUrl || canEdit

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <button
          type="button"
          onClick={isPending ? undefined : handleAvatarClick}
          aria-disabled={isPending}
          tabIndex={isClickable ? undefined : -1}
          className={[
            'w-[87px] h-[87px] rounded-full overflow-hidden border-2 border-gray-200 flex-shrink-0',
            isClickable && !isPending ? 'cursor-pointer' : 'cursor-default',
            isPending ? 'opacity-50 cursor-wait' : '',
          ].join(' ')}
          aria-label={fotoUrl ? 'Ver foto em tamanho real' : canEdit ? 'Adicionar foto de perfil' : 'Sem foto'}
        >
          {fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
          ) : (
            <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <circle cx="48" cy="48" r="48" fill="#D8D8D8" />
              <circle cx="48" cy="38" r="15" stroke="#FFFFFF" strokeWidth="7" />
              <path d="M14 84c0-18.778 15.222-34 34-34s34 15.222 34 34" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" fill="none" />
            </svg>
          )}
        </button>

        {canEdit && (
          <>
            <button
              type="button"
              onClick={isPending ? undefined : () => setMenuAberto((v) => !v)}
              aria-disabled={isPending}
              aria-label="Editar foto"
              className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white border border-gray-300 shadow-sm flex items-center justify-center hover:bg-gray-50"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.5 12.3l-2.8.7.7-2.8 7.9-7.9Z"
                  stroke="#686868"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {menuAberto && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
                <div className="absolute top-7 right-0 z-20 bg-white rounded-md shadow-lg border border-gray-200 py-1 w-36">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuAberto(false)
                      inputRef.current?.click()
                    }}
                    className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {fotoUrl ? 'Alterar foto' : 'Adicionar foto'}
                  </button>
                  {fotoUrl && (
                    <button
                      type="button"
                      onClick={handleRemover}
                      className="block w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-gray-50"
                    >
                      Remover foto
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {errorMsg && (
        <p className="text-xs text-red-600 text-center max-w-[96px]">{errorMsg}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />

      {fotoUrl && (
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          slides={[{ src: fotoUrl }]}
        />
      )}
    </div>
  )
}
