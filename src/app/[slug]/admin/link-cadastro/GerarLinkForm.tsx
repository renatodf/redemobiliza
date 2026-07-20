'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { gerarLinkCadastro, type GerarLinkCadastroState } from '@/actions/admin/gerar-link-cadastro'
import { corTextoContraste } from '@/lib/cor-contraste'
import { ComboBoxMultiplo } from '@/components/admin/ComboBoxMultiplo'

type Segmento = { id: string; nome: string }
type Mobilizador = { id: string; nome: string }

const initialState: GerarLinkCadastroState = {}

function BotaoGerar({ corPrimaria, corTexto }: { corPrimaria: string; corTexto: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{ backgroundColor: corPrimaria, color: corTexto }}
      className="px-6 py-2.5 rounded-md text-sm font-medium disabled:opacity-50"
    >
      {pending ? 'Gerando...' : 'Gerar Link'}
    </button>
  )
}

export default function GerarLinkForm({
  slug,
  segmentos,
  mobilizadores,
  corPrimaria,
}: {
  slug: string
  segmentos: Segmento[]
  mobilizadores: Mobilizador[]
  corPrimaria: string
}) {
  const corTexto = corTextoContraste(corPrimaria)
  const [state, action] = useFormState(gerarLinkCadastro, initialState)
  const [segmentosSelecionados, setSegmentosSelecionados] = useState<Set<string>>(new Set())
  const [copiado, setCopiado] = useState(false)

  function toggleSegmento(id: string) {
    setSegmentosSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function copiarLink() {
    if (!state.link) return
    await navigator.clipboard.writeText(state.link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <form action={action} className="space-y-5">
        <input type="hidden" name="slug" value={slug} />
        {Array.from(segmentosSelecionados).map((id) => (
          <input key={id} type="hidden" name="segmentoIds" value={id} />
        ))}

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Segmentos para esse cadastro</p>
          {segmentos.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhum segmento ativo cadastrado.</p>
          ) : (
            <>
              <ComboBoxMultiplo
                opcoes={segmentos.map((seg) => ({ id: seg.id, label: seg.nome }))}
                selecionados={segmentosSelecionados}
                onToggle={toggleSegmento}
                placeholder="Buscar segmento..."
              />
              {segmentosSelecionados.size > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {segmentos
                    .filter((seg) => segmentosSelecionados.has(seg.id))
                    .map((seg) => (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => toggleSegmento(seg.id)}
                        style={{ backgroundColor: corPrimaria, color: corTexto }}
                        className="px-3 py-1.5 rounded-md text-xs font-medium"
                      >
                        {seg.nome}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rede (opcional)
          </label>
          <select
            name="mobilizadorPessoaId"
            defaultValue=""
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Rede Raiz (sem mobilizador)</option>
            {mobilizadores.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </div>

        {state.erro && <p className="text-sm text-red-600">{state.erro}</p>}

        <BotaoGerar corPrimaria={corPrimaria} corTexto={corTexto} />
      </form>

      {state.link && (
        <div className="border-t border-gray-100 pt-5 space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Link gerado</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={state.link}
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono bg-gray-50"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={copiarLink}
                style={{ backgroundColor: corPrimaria, color: corTexto }}
                className="px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap"
              >
                {copiado ? 'Copiado!' : 'Copiar Link'}
              </button>
            </div>
          </div>

          {state.qrPngDataUrl && (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.qrPngDataUrl} alt="QR Code do link gerado" className="w-48 h-48" />
              <div className="flex gap-4">
                <a href={state.qrPngDataUrl} download="qr-link-cadastro.png" className="text-xs text-blue-600 underline">
                  Baixar PNG
                </a>
                {state.qrTransparenteDataUrl && (
                  <a href={state.qrTransparenteDataUrl} download="qr-link-cadastro-transparente.png" className="text-xs text-blue-600 underline">
                    Baixar PNG transparente
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
