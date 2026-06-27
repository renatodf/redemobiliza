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
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)

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
    setErrorMsg(null)
    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('pessoaId', pessoaId)

    startTransition(async () => {
      try {
        await removerFotoPessoa(formData)
        setConfirmandoRemocao(false)
        router.refresh()
      } catch (err) {
        setConfirmandoRemocao(false)
        setErrorMsg(err instanceof Error ? err.message : 'Erro ao remover foto')
      }
    })
  }

  const isClickable = !!fotoUrl || canEdit

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={isPending ? undefined : handleAvatarClick}
        aria-disabled={isPending}
        tabIndex={isClickable ? undefined : -1}
        className={[
          'w-24 h-24 rounded-full overflow-hidden border-2 border-gray-200 flex-shrink-0',
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
            <circle cx="48" cy="48" r="48" fill="#E5E7EB" />
            <circle cx="48" cy="38" r="16" fill="#9CA3AF" />
            <path d="M16 80c0-17.673 14.327-32 32-32s32 14.327 32 32" fill="#9CA3AF" />
          </svg>
        )}
      </button>

      {canEdit && fotoUrl && (
        confirmandoRemocao ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600">Remover foto?</span>
            <button
              type="button"
              onClick={isPending ? undefined : handleRemover}
              aria-disabled={isPending}
              className={`text-red-600 font-medium hover:underline${isPending ? ' opacity-50' : ''}`}
            >
              Sim
            </button>
            <button
              type="button"
              onClick={isPending ? undefined : () => setConfirmandoRemocao(false)}
              aria-disabled={isPending}
              className={`text-gray-500 hover:underline${isPending ? ' opacity-50' : ''}`}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isPending ? undefined : () => inputRef.current?.click()}
              aria-disabled={isPending}
              className={`text-xs text-blue-600 hover:underline${isPending ? ' opacity-50' : ''}`}
            >
              Alterar foto
            </button>
            <button
              type="button"
              onClick={isPending ? undefined : () => { setConfirmandoRemocao(true); setErrorMsg(null) }}
              aria-disabled={isPending}
              className={`text-xs text-red-500 hover:underline${isPending ? ' opacity-50' : ''}`}
            >
              Remover foto
            </button>
          </div>
        )
      )}

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
