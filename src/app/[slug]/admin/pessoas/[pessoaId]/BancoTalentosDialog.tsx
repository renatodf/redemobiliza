'use client'

import { useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import { salvarBancoTalentos } from '@/actions/admin/salvar-banco-talentos'
import { corTextoContraste } from '@/lib/cor-contraste'

interface Area {
  id: string
  nome: string
}

interface Props {
  slug: string
  pessoaId: string
  primeiroNome: string
  jaCadastrado: boolean
  areasDisponiveis: Area[]
  corPrimaria: string
  bancoTalentos: {
    curriculoUrl: string | null
    prioridade: number
    isPcd: boolean
    observacao: string | null
    colocado: boolean
    areaIds: string[]
  } | null
}

const DIALOG_ID = 'dialog-banco-talentos'

const PRIORIDADES = [
  { valor: 1, descricao: 'Vínculo forte (ex: voluntário de campanha)' },
  { valor: 2, descricao: 'Indicado por alguém de confiança' },
  { valor: 3, descricao: 'Currículo recebido sem vínculo direto' },
]

export default function BancoTalentosDialog({
  slug,
  pessoaId,
  primeiroNome,
  jaCadastrado,
  areasDisponiveis,
  corPrimaria,
  bancoTalentos,
}: Props) {
  const corTexto = corTextoContraste(corPrimaria)
  const [state, action, pending] = useFormState(salvarBancoTalentos, {})
  const [areasSelecionadas, setAreasSelecionadas] = useState<Set<string>>(
    new Set(bancoTalentos?.areaIds ?? [])
  )
  const [prioridade, setPrioridade] = useState(bancoTalentos?.prioridade ?? 3)
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const inputArquivoRef = useRef<HTMLInputElement>(null)

  const titulo = jaCadastrado
    ? `Atualizar Banco de Talentos de ${primeiroNome}`
    : `Incluir ${primeiroNome} no Banco de Talentos`

  function toggleArea(id: string) {
    setAreasSelecionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function definirArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    if (inputArquivoRef.current) {
      const dt = new DataTransfer()
      dt.items.add(arquivo)
      inputArquivoRef.current.files = dt.files
    }
    setNomeArquivo(arquivo.name)
  }

  function fechar() {
    ;(document.getElementById(DIALOG_ID) as HTMLDialogElement)?.close()
  }

  return (
    <>
      <button
        type="button"
        style={{ backgroundColor: corPrimaria, color: corTexto }}
        className="text-xs px-3 py-1.5 rounded-md hover:opacity-90 font-medium"
        onClick={() => (document.getElementById(DIALOG_ID) as HTMLDialogElement)?.showModal()}
      >
        {titulo}
      </button>

      <dialog
        id={DIALOG_ID}
        style={{ ['--cp' as string]: corPrimaria }}
        className="rounded-sm shadow-xl p-0 w-full max-w-2xl backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-lg text-[#757575]">{titulo}</h2>
          <button type="button" onClick={fechar} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <form action={action} encType="multipart/form-data" className="px-6 py-5 space-y-5">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="pessoaId" value={pessoaId} />
          <input type="hidden" name="prioridade" value={prioridade} />
          {Array.from(areasSelecionadas).map((id) => (
            <input key={id} type="hidden" name="areaIds" value={id} />
          ))}

          <div
            className={`rounded-sm border-2 border-dashed ${arrastando ? 'border-[var(--cp)] bg-blue-50' : 'border-[#B5B5B5] bg-[#F2F2F2]'} px-6 py-8 text-center cursor-pointer transition-colors`}
            onClick={() => inputArquivoRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault()
              setArrastando(false)
              definirArquivo(e.dataTransfer.files?.[0])
            }}
          >
            <svg width="31" height="39" viewBox="0 0 31 39" fill="none" className="mx-auto mb-2" aria-hidden>
              <path d="M2 2h16l11 11v24H2V2Z" fill={corPrimaria} opacity="0.15" stroke={corPrimaria} strokeWidth="1.6" />
              <path d="M18 2v11h11" stroke={corPrimaria} strokeWidth="1.6" fill="none" />
            </svg>
            {nomeArquivo ? (
              <>
                <p className="text-lg" style={{ color: corPrimaria }}>Currículo selecionado</p>
                <p className="text-xs text-[#757575] mt-1">{nomeArquivo}</p>
              </>
            ) : bancoTalentos?.curriculoUrl ? (
              <>
                <p className="text-lg text-[#757575]">Enviar Currículo</p>
                <p className="text-xs mt-1">
                  <a
                    href={bancoTalentos.curriculoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline"
                    style={{ color: corPrimaria }}
                  >
                    Ver currículo atual
                  </a>
                </p>
              </>
            ) : (
              <p className="text-lg text-[#757575]">Enviar Currículo</p>
            )}
            <p className="text-[10px] text-[#757575] mt-2">Extensão PDF, Word, JPG ou PNG (máx 10MB)</p>
            <input
              ref={inputArquivoRef}
              name="curriculo"
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => definirArquivo(e.target.files?.[0])}
            />
          </div>

          <div>
            <p className="text-sm text-[#686868] mb-2">Área desejada *</p>
            <div className="flex flex-wrap gap-2">
              {areasDisponiveis.map((area) => {
                const selecionada = areasSelecionadas.has(area.id)
                return (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => toggleArea(area.id)}
                    style={selecionada ? { backgroundColor: corPrimaria, color: corTexto } : undefined}
                    className={`px-3 py-1 rounded-[3px] text-[10px] uppercase font-medium ${
                      selecionada ? '' : 'bg-[#757575] text-white opacity-70 hover:opacity-100'
                    }`}
                  >
                    {area.nome}
                  </button>
                )
              })}
              {areasDisponiveis.length === 0 && (
                <p className="text-xs text-gray-500">
                  Nenhuma área cadastrada — configure em Configurações → Áreas de Colocação.
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm text-[#686868] mb-2">Prioridade *</p>
            <div className="flex gap-2">
              {PRIORIDADES.map((p) => (
                <button
                  key={p.valor}
                  type="button"
                  title={p.descricao}
                  onClick={() => setPrioridade(p.valor)}
                  style={prioridade === p.valor ? { backgroundColor: corPrimaria, color: corTexto } : undefined}
                  className={`w-9 h-9 rounded-[3px] text-sm font-medium ${
                    prioridade === p.valor ? '' : 'bg-[#757575] text-white opacity-70 hover:opacity-100'
                  }`}
                >
                  {p.valor}
                </button>
              ))}
              <p className="text-xs text-[#757575] self-center ml-2">
                {PRIORIDADES.find((p) => p.valor === prioridade)?.descricao}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#686868]">
            <input type="checkbox" name="isPcd" defaultChecked={bancoTalentos?.isPcd ?? false} />
            Pessoa com Deficiência (PcD)
          </label>

          <div>
            <label className="block text-sm text-[#686868] mb-1">Adicionar observação</label>
            <textarea
              name="observacao"
              rows={3}
              defaultValue={bancoTalentos?.observacao ?? ''}
              placeholder="Justificativa da prioridade, contexto, etc. (visível apenas ao admin)"
              className="block w-full bg-[#F2F2F2] rounded-sm px-3 py-2 text-sm text-[#757575] outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#686868]">
            <input type="checkbox" name="colocado" defaultChecked={bancoTalentos?.colocado ?? false} />
            Colocado no mercado
          </label>

          {state.erro && <p className="text-sm text-red-600">{state.erro}</p>}
          {state.ok && <p className="text-sm text-green-600">Salvo com sucesso!</p>}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" className="text-sm text-gray-500 hover:underline" onClick={fechar}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              style={{ backgroundColor: corPrimaria, color: corTexto }}
              className="px-6 py-2.5 rounded-sm text-sm font-medium tracking-wide disabled:opacity-50 shadow-[0_12px_35px_rgba(212,212,212,1)]"
            >
              {pending ? 'ENVIANDO...' : 'ENVIAR ARQUIVO'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
