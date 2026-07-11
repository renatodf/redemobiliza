'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { verificarWhatsApp } from '@/actions/public/verificar-whatsapp'
import { submeterCadastro } from '@/actions/public/submeter-cadastro'
import { comprimirImagem } from '@/lib/comprimir-imagem'
import { corTextoContraste } from '@/lib/cor-contraste'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }

type Props = {
  slug: string
  segmentoSlugs: string[]
  mobilizadorToken?: string
  sucessoUrl: string
  regioes: Regiao[]
  profissoes: Profissao[]
  corPrimaria: string
}

type Passo = 'whatsapp' | 'dados' | 'confirmacao'

export default function CadastroForm({
  slug,
  segmentoSlugs,
  mobilizadorToken,
  sucessoUrl,
  regioes,
  profissoes,
  corPrimaria,
}: Props) {
  const corTexto = corTextoContraste(corPrimaria)
  const estiloBotaoPrimario = { backgroundColor: corPrimaria, color: corTexto }
  const [passo, setPasso] = useState<Passo>('whatsapp')
  const [whatsapp, setWhatsapp] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [previewFoto, setPreviewFoto] = useState<string | null>(null)
  const [comprimindo, setComprimindo] = useState(false)
  const inputFotoRef = useRef<HTMLInputElement>(null)
  const [webcamDisponivel, setWebcamDisponivel] = useState(false)
  const [webcamAtiva, setWebcamAtiva] = useState(false)
  const [webcamErro, setWebcamErro] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    setWebcamDisponivel(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)
  }, [])

  useEffect(() => {
    if (webcamAtiva && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [webcamAtiva])

  useEffect(() => {
    if (passo === 'dados') return
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setWebcamAtiva(false)
  }, [passo])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

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
      setPreviewFoto(URL.createObjectURL(comprimido))
    } finally {
      setComprimindo(false)
    }
  }

  async function handleAbrirWebcam() {
    setWebcamErro(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      setWebcamAtiva(true)
    } catch {
      setWebcamErro('Não foi possível acessar a câmera. Verifique as permissões do navegador.')
    }
  }

  function handleFecharWebcam() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setWebcamAtiva(false)
  }

  function handleCapturarFoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const arquivo = new File([blob], 'webcam.jpg', { type: 'image/jpeg' })
      const comprimido = await comprimirImagem(arquivo)
      if (inputFotoRef.current) {
        const dt = new DataTransfer()
        dt.items.add(comprimido)
        inputFotoRef.current.files = dt.files
      }
      setPreviewFoto(URL.createObjectURL(comprimido))
      handleFecharWebcam()
    }, 'image/jpeg', 0.9)
  }

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
        segmentoSlugs,
        whatsapp,
        nome: fd.get('nome') as string,
        email: fd.get('email') as string,
        regiaoId: fd.get('regiaoId') as string,
        profissaoId: fd.get('profissaoId') as string,
        genero: fd.get('genero') as string,
        mobilizadorToken,
        sucessoUrl,
        foto: fd.get('foto') as File | null,
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
        segmentoSlugs,
        whatsapp,
        nome: '',
        mobilizadorToken,
        sucessoUrl,
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
            style={estiloBotaoPrimario}
            className="w-full py-2 px-4 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
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
            <label className="block text-sm font-medium text-gray-700">Foto (opcional)</label>
            {webcamAtiva ? (
              <div className="mt-1 space-y-2">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-xs rounded-md bg-black" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCapturarFoto}
                    style={estiloBotaoPrimario}
                    className="flex-1 py-1.5 px-3 rounded-md text-xs font-medium hover:opacity-90"
                  >
                    Capturar
                  </button>
                  <button
                    type="button"
                    onClick={handleFecharWebcam}
                    className="flex-1 border border-gray-300 text-gray-700 py-1.5 px-3 rounded-md text-xs font-medium hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center border border-gray-200">
                  {previewFoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewFoto} alt="Pré-visualização" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-gray-300 text-2xl">👤</span>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="foto-input"
                      style={estiloBotaoPrimario}
                      className="text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium cursor-pointer"
                    >
                      Escolher arquivo
                    </label>
                    <input
                      ref={inputFotoRef}
                      id="foto-input"
                      name="foto"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFotoChange}
                      className="sr-only"
                    />
                    {webcamDisponivel && (
                      <button
                        type="button"
                        onClick={handleAbrirWebcam}
                        style={estiloBotaoPrimario}
                        className="text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
                      >
                        Tirar foto pela webcam
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {comprimindo ? 'Reduzindo tamanho da imagem…' : 'Envie uma foto ou tire na hora.'}
                  </p>
                </div>
              </div>
            )}
            {webcamErro && <p className="text-xs text-red-600 mt-1">{webcamErro}</p>}
          </div>
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
              style={estiloBotaoPrimario}
              className="flex-1 py-2 px-4 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
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
              style={estiloBotaoPrimario}
              className="flex-1 py-2 px-4 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Confirmando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
