'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { uploadFotoPessoa } from '@/actions/admin/upload-foto-pessoa'

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

  function handleAvatarClick() {
    if (fotoUrl) {
      setLightboxOpen(true)
    } else if (canEdit) {
      inputRef.current?.click()
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('pessoaId', pessoaId)
    formData.set('foto', file)

    startTransition(async () => {
      try {
        await uploadFotoPessoa(formData)
        router.refresh()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao enviar foto')
      }
    })
  }

  const isClickable = !!fotoUrl || canEdit

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleAvatarClick}
        disabled={isPending}
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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
          className="text-xs text-blue-600 hover:underline disabled:opacity-50"
        >
          Alterar foto
        </button>
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
