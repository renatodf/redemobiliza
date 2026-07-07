'use client'

import { useFormState } from 'react-dom'
import { salvarBancoTalentos } from '@/actions/admin/salvar-banco-talentos'

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

export default function BancoTalentosDialog({
  slug,
  pessoaId,
  primeiroNome,
  jaCadastrado,
  areasDisponiveis,
  bancoTalentos,
}: Props) {
  const [state, action, pending] = useFormState(salvarBancoTalentos, {})
  const titulo = jaCadastrado
    ? `Atualizar Banco de Talentos de ${primeiroNome}`
    : `Incluir ${primeiroNome} no Banco de Talentos`

  return (
    <>
      <button
        type="button"
        className="text-sm text-blue-700 hover:underline"
        onClick={() => (document.getElementById(DIALOG_ID) as HTMLDialogElement)?.showModal()}
      >
        {titulo}
      </button>

      <dialog id={DIALOG_ID} className="rounded-lg shadow-xl p-6 w-full max-w-md backdrop:bg-black/40">
        <h2 className="text-base font-semibold mb-4">{titulo}</h2>
        <form action={action} encType="multipart/form-data" className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="pessoaId" value={pessoaId} />

          <div>
            <label className="block text-sm font-medium text-gray-700">Currículo</label>
            {bancoTalentos?.curriculoUrl && (
              <p className="text-xs text-gray-500 mb-1">
                <a
                  href={bancoTalentos.curriculoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Ver currículo atual
                </a>
              </p>
            )}
            <input
              name="curriculo"
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="mt-1 block w-full text-sm"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700">Área desejada *</legend>
            <div className="mt-1 grid grid-cols-2 gap-1 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
              {areasDisponiveis.map((area) => (
                <label key={area.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="areaIds"
                    value={area.id}
                    defaultChecked={bancoTalentos?.areaIds.includes(area.id) ?? false}
                  />
                  {area.nome}
                </label>
              ))}
              {areasDisponiveis.length === 0 && (
                <p className="text-xs text-gray-500 col-span-2">
                  Nenhuma área cadastrada — configure em Configurações → Áreas de Colocação.
                </p>
              )}
            </div>
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-gray-700">Prioridade *</label>
            <select
              name="prioridade"
              defaultValue={String(bancoTalentos?.prioridade ?? 3)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="1">1 — Vínculo forte (ex: voluntário de campanha)</option>
              <option value="2">2 — Indicado por alguém de confiança</option>
              <option value="3">3 — Currículo recebido sem vínculo direto</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPcd" defaultChecked={bancoTalentos?.isPcd ?? false} />
            Pessoa com Deficiência (PcD)
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700">Observação interna</label>
            <textarea
              name="observacao"
              rows={3}
              defaultValue={bancoTalentos?.observacao ?? ''}
              placeholder="Justificativa da prioridade, contexto, etc. (visível apenas ao admin)"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="colocado" defaultChecked={bancoTalentos?.colocado ?? false} />
            Colocado no mercado
          </label>

          {state.erro && <p className="text-sm text-red-600">{state.erro}</p>}
          {state.ok && <p className="text-sm text-green-600">Salvo com sucesso!</p>}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              className="text-sm text-gray-600 hover:underline"
              onClick={() => (document.getElementById(DIALOG_ID) as HTMLDialogElement)?.close()}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {pending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
