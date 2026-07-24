// src/app/[slug]/admin/filtros/PessoasFiltro.tsx
import Link from 'next/link'
import Pagination from '@/components/admin/Pagination'
import VisualizarDadosGeraisButton from '@/components/admin/VisualizarDadosGeraisButton'
import { LIMITE_EXPORT_SINCRONO } from '@/lib/filtros-pessoas'

type PessoaLinha = {
  id: string
  nome: string
  whatsapp: string
  email: string | null
  nascimento: Date | null
  regiao: { nome: string } | null
  profissao: { nome: string } | null
  segmentos: { segmento: { nome: string } }[]
}

export default function PessoasFiltro({
  baseHref,
  baseHrefPessoa,
  dashboardHref,
  exportarHref,
  searchParams,
  pessoas,
  totalFiltrado,
  paginaAtual,
  tamanhoPagina,
  regioes,
  profissoes,
  segmentos,
  escolaridades,
  religioes,
  corPrimaria,
}: {
  baseHref: string
  baseHrefPessoa: string
  dashboardHref: string
  exportarHref: string
  searchParams: Record<string, string | undefined>
  pessoas: PessoaLinha[]
  totalFiltrado: number
  paginaAtual: number
  tamanhoPagina: number
  regioes: { id: string; nome: string }[]
  profissoes: { id: string; nome: string }[]
  segmentos: { id: string; nome: string }[]
  escolaridades: string[]
  religioes: string[]
  corPrimaria: string
}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== 'page') qs.set(k, v)
  }
  const queryAtual = qs.toString()
  const separador = queryAtual ? '&' : ''

  return (
    <div className="space-y-4">
      <form method="get" action={baseHref} className="flex flex-wrap items-end gap-3 bg-gray-50 p-4 rounded-lg">
        <div>
          <label className="block text-xs font-medium text-gray-600">Aniversário</label>
          <select name="aniversario" defaultValue={searchParams.aniversario ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="dia">Hoje</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mês</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Sexo</label>
          <select name="genero" defaultValue={searchParams.genero ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
            <option value="outro">Outro</option>
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
        <div>
          <label className="block text-xs font-medium text-gray-600">Profissão</label>
          <select name="profissaoId" defaultValue={searchParams.profissaoId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {profissoes.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Segmento</label>
          <select name="segmentoId" defaultValue={searchParams.segmentoId ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {segmentos.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Idade mín.</label>
          <input type="number" name="idadeMin" min={0} defaultValue={searchParams.idadeMin ?? ''} className="mt-1 w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Idade máx.</label>
          <input type="number" name="idadeMax" min={0} defaultValue={searchParams.idadeMax ?? ''} className="mt-1 w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Escolaridade</label>
          <select name="escolaridade" defaultValue={searchParams.escolaridade ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {escolaridades.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Religião</label>
          <select name="religiao" defaultValue={searchParams.religiao ?? ''} className="mt-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {religioes.map((r) => (
              <option key={r} value={r}>{r}</option>
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
        <a
          href={baseHref}
          className="text-sm text-gray-500 underline px-2 py-1.5 hover:text-gray-700"
        >
          Limpar filtro
        </a>
      </form>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm text-gray-600">{totalFiltrado.toLocaleString('pt-BR')} pessoa(s) encontrada(s)</p>
          {totalFiltrado >= LIMITE_EXPORT_SINCRONO && (
            <p className="text-xs text-amber-600 mt-0.5">
              Esse filtro tem muitos resultados — o arquivo será enviado por e-mail.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <VisualizarDadosGeraisButton dashboardHref={dashboardHref} searchParams={searchParams} corPrimaria={corPrimaria} />
          <a
            href={`${exportarHref}?${queryAtual}${separador}formato=pdf`}
            style={{ backgroundColor: corPrimaria }}
            className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
          >
            Exportar PDF
          </a>
          <a
            href={`${exportarHref}?${queryAtual}${separador}formato=excel`}
            style={{ backgroundColor: corPrimaria }}
            className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
          >
            Exportar Excel
          </a>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Nome</th>
              <th className="py-2 pr-3">WhatsApp</th>
              <th className="py-2 pr-3">Região</th>
              <th className="py-2 pr-3">Profissão</th>
              <th className="py-2 pr-3">Segmentos</th>
              <th className="py-2 pr-3">Nascimento</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-2 pr-3">
                  <Link href={`${baseHrefPessoa}/${p.id}`} className="hover:underline">
                    {p.nome}
                  </Link>
                </td>
                <td className="py-2 pr-3">{p.whatsapp}</td>
                <td className="py-2 pr-3">{p.regiao?.nome ?? '—'}</td>
                <td className="py-2 pr-3">{p.profissao?.nome ?? '—'}</td>
                <td className="py-2 pr-3">{p.segmentos.map((s) => s.segmento.nome).join(', ') || '—'}</td>
                <td className="py-2 pr-3">{p.nascimento ? p.nascimento.toLocaleDateString('pt-BR') : '—'}</td>
              </tr>
            ))}
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-400">Nenhuma pessoa encontrada com esses filtros.</td>
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
    </div>
  )
}
