'use client'

import { useState } from 'react'
import Pagination from '@/components/admin/Pagination'
import { corTextoContraste } from '@/lib/cor-contraste'
import { ComboBoxMultiplo } from '@/components/admin/ComboBoxMultiplo'

type TalentoLinha = {
  pessoaId: string
  prioridade: number
  isPcd: boolean
  curriculoUrl: string | null
  pessoa: { nome: string; regiao: { nome: string } | null }
  areas: { area: { nome: string } }[]
}

type Mobilizador = { id: string; nome: string }

export default function BancoTalentosFiltro({
  baseHref,
  exportarHref,
  searchParams,
  talentos,
  totalFiltrado,
  paginaAtual,
  tamanhoPagina,
  areas,
  regioes,
  mobilizadores,
  corPrimaria,
}: {
  baseHref: string
  exportarHref: string
  searchParams: Record<string, string | undefined>
  talentos: TalentoLinha[]
  totalFiltrado: number
  paginaAtual: number
  tamanhoPagina: number
  areas: { id: string; nome: string }[]
  regioes: { id: string; nome: string }[]
  mobilizadores: Mobilizador[]
  corPrimaria: string
}) {
  const corTexto = corTextoContraste(corPrimaria)
  const [areasFiltro, setAreasFiltro] = useState<Set<string>>(
    new Set((searchParams.areaIds ?? '').split(',').filter(Boolean))
  )
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [dialogAberto, setDialogAberto] = useState(false)
  const [abrirDemanda, setAbrirDemanda] = useState(false)
  const [responsavelId, setResponsavelId] = useState('')

  function toggleAreaFiltro(id: string) {
    setAreasFiltro((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelecionado(pessoaId: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(pessoaId)) next.delete(pessoaId)
      else next.add(pessoaId)
      return next
    })
  }

  function toggleTodos() {
    if (selecionados.size === talentos.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(talentos.map((t) => t.pessoaId)))
    }
  }

  return (
    <div className="space-y-4">
      <form method="get" action={baseHref} className="flex flex-wrap items-end gap-3 bg-gray-50 p-4 rounded-lg">
        <input type="hidden" name="areaIds" value={Array.from(areasFiltro).join(',')} />
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Área de interesse</p>
          <ComboBoxMultiplo
            opcoes={areas.map((a) => ({ id: a.id, label: a.nome }))}
            selecionados={areasFiltro}
            onToggle={toggleAreaFiltro}
            placeholder="Buscar área..."
          />
          {areasFiltro.size > 0 && (
            <div className="flex flex-wrap gap-1.5 max-w-md mt-2">
              {areas
                .filter((a) => areasFiltro.has(a.id))
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAreaFiltro(a.id)}
                    style={{ backgroundColor: corPrimaria, color: corTexto }}
                    className="px-2.5 py-1 rounded text-xs font-medium"
                  >
                    {a.nome}
                  </button>
                ))}
            </div>
          )}
          {areas.length === 0 && <p className="text-xs text-gray-500 mt-1">Nenhuma área cadastrada.</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Nome</label>
          <input
            type="text"
            name="nome"
            defaultValue={searchParams.nome ?? ''}
            placeholder="Buscar por nome..."
            className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Prioridade</label>
          <select name="prioridade" defaultValue={searchParams.prioridade ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">PcD</label>
          <select name="isPcd" defaultValue={searchParams.isPcd ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Região</label>
          <select name="regiaoId" defaultValue={searchParams.regiaoId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          style={{ backgroundColor: corPrimaria }}
          className="text-white text-sm px-4 py-1.5 rounded-md font-medium hover:opacity-90"
        >
          Filtrar
        </button>
        <a href={baseHref} className="text-sm text-gray-500 underline px-2 py-1.5 hover:text-gray-700">
          Limpar filtro
        </a>
      </form>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-600">{totalFiltrado.toLocaleString('pt-BR')} candidato(s) encontrado(s)</p>
        <button
          type="button"
          disabled={selecionados.size === 0}
          onClick={() => setDialogAberto(true)}
          style={{ backgroundColor: corPrimaria }}
          className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Exportar selecionados ({selecionados.size})
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">
                <input
                  type="checkbox"
                  checked={talentos.length > 0 && selecionados.size === talentos.length}
                  onChange={toggleTodos}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">Região</th>
              <th className="py-2 pr-3">Áreas</th>
              <th className="py-2 pr-3">Prioridade</th>
              <th className="py-2 pr-3">PcD</th>
              <th className="py-2 pr-3">Currículo</th>
            </tr>
          </thead>
          <tbody>
            {talentos.map((t) => (
              <tr key={t.pessoaId} className="border-b border-gray-100">
                <td className="py-2 pr-3">
                  <input
                    type="checkbox"
                    checked={selecionados.has(t.pessoaId)}
                    onChange={() => toggleSelecionado(t.pessoaId)}
                    aria-label={`Selecionar ${t.pessoa.nome}`}
                  />
                </td>
                <td className="py-2 pr-3">{t.pessoa.nome}</td>
                <td className="py-2 pr-3">{t.pessoa.regiao?.nome ?? '—'}</td>
                <td className="py-2 pr-3">{t.areas.map((a) => a.area.nome).join(', ') || '—'}</td>
                <td className="py-2 pr-3">{t.prioridade}</td>
                <td className="py-2 pr-3">{t.isPcd ? 'Sim' : 'Não'}</td>
                <td className="py-2 pr-3">
                  <a
                    href={t.curriculoUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: corPrimaria }}
                  >
                    Ver
                  </a>
                </td>
              </tr>
            ))}
            {talentos.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-400">Nenhum candidato encontrado com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItens={totalFiltrado}
        paginaAtual={paginaAtual}
        tamanhoPagina={tamanhoPagina}
        baseUrl={baseHref}
        searchParams={searchParams}
        corPrimaria={corPrimaria}
      />

      {dialogAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Exportar currículos</h2>
            <p className="text-sm text-gray-600">{selecionados.size} selecionado(s).</p>
            <div>
              <p className="text-sm text-gray-700 mb-2">Abrir demanda de acompanhamento de encaminhamento pra cada um?</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="abrirDemandaRadio" checked={!abrirDemanda} onChange={() => setAbrirDemanda(false)} />
                  Não
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="abrirDemandaRadio" checked={abrirDemanda} onChange={() => setAbrirDemanda(true)} />
                  Sim
                </label>
              </div>
            </div>
            {abrirDemanda && (
              <div>
                <label className="block text-xs font-medium text-gray-600">Responsável</label>
                <select
                  value={responsavelId}
                  onChange={(e) => setResponsavelId(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">Selecionar...</option>
                  {mobilizadores.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
            )}
            <form method="post" action={exportarHref}>
              {Array.from(selecionados).map((id) => (
                <input key={id} type="hidden" name="pessoaId" value={id} />
              ))}
              {abrirDemanda && <input type="hidden" name="abrirDemanda" value="sim" />}
              {abrirDemanda && <input type="hidden" name="responsavelId" value={responsavelId} />}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDialogAberto(false)} className="text-sm text-gray-500 hover:underline">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={abrirDemanda && !responsavelId}
                  style={{ backgroundColor: corPrimaria, color: corTexto }}
                  className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                >
                  Confirmar e baixar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
