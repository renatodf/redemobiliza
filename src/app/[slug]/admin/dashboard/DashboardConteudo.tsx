// src/app/[slug]/admin/dashboard/DashboardConteudo.tsx
import Link from 'next/link'
import { GraficoDemandas } from '@/components/GraficoDemandas'
import { GraficoPizza, type FatiaPizza } from '@/components/GraficoPizza'
import MapaCadastros from '@/components/MapaCadastrosLoader'
import { calcularIdade } from '@/lib/aniversario'
import { calcularFaixaEtaria } from '@/lib/faixa-etaria'
import { agruparTopEOutros } from '@/lib/agrupar-top-outros'
import { PALETA_CATEGORICA, COR_NEUTRA, CORES_STATUS_DEMANDA } from '@/lib/cores-graficos'
import { CAMPOS_FILTRO_PESSOAS, CAMPOS_FILTRO_DEMANDAS } from '@/lib/filtros-ativos'

type ContagemChave = { chave: string | null; contagem: number }

const LABEL_ORIGEM: Record<string, string> = {
  qrcode: 'QR Code',
  link: 'Link',
  manual: 'Manual',
  indicacao: 'Indicação',
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  importacao: 'Importação',
}

function construirHref(
  base: string,
  searchParams: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>,
  excluir: string[]
): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && !excluir.includes(k)) qs.set(k, v)
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v) qs.set(k, v)
  }
  return `${base}?${qs.toString()}`
}

function faixaParaQuery(faixa: string): Record<string, string> {
  if (faixa === '16-24') return { idadeMin: '16', idadeMax: '24' }
  if (faixa === '25-34') return { idadeMin: '25', idadeMax: '34' }
  if (faixa === '35-44') return { idadeMin: '35', idadeMax: '44' }
  if (faixa === '45-59') return { idadeMin: '45', idadeMax: '59' }
  return { idadeMin: '60' }
}

export function DashboardConteudo({
  slug,
  pessoaHrefBase,
  dashboardHref,
  filtrosHref,
  demandasHref,
  searchParams,
  periodo,
  labelPeriodo,
  totalPessoas,
  novasPessoas,
  totalMobilizadores,
  totalEquipe,
  segmentosComContagem,
  rankingMobilizadores,
  pessoasPorOrigem,
  regioes,
  contagemGenero,
  contagemDemandas,
  mesLabel,
  dataInicioStr,
  dataFimStr,
  nascimentos,
  totalSemNascimento,
  escolaridade,
  religiao,
  segmentoAtivo,
  profissaoAtiva,
  redeAtiva,
  areaAtiva,
}: {
  slug: string
  pessoaHrefBase: string
  dashboardHref: string
  filtrosHref: string
  demandasHref: string
  searchParams: Record<string, string | undefined>
  periodo: string
  labelPeriodo: Record<string, string>
  totalPessoas: number
  novasPessoas: number
  totalMobilizadores: number
  totalEquipe: number
  segmentosComContagem: { nome: string; tipo: string; contagem: number }[]
  rankingMobilizadores: { id: string; nome: string; contagem: number }[]
  pessoasPorOrigem: ContagemChave[]
  regioes: { id: string; nome: string; ativa: boolean; contagem: number; uf: string | null; latitude: number | null; longitude: number | null }[]
  contagemGenero: ContagemChave[]
  contagemDemandas: ContagemChave[]
  mesLabel: string
  dataInicioStr: string
  dataFimStr: string
  nascimentos: Date[]
  totalSemNascimento: number
  escolaridade: ContagemChave[]
  religiao: ContagemChave[]
  segmentoAtivo?: { nome: string } | null
  profissaoAtiva?: { nome: string } | null
  redeAtiva?: { nome: string } | null
  areaAtiva?: { nome: string } | null
}) {
  // Demandas — cores de status reservadas, sempre as 4 fatias (mesmo 0)
  const mapaDemandas = Object.fromEntries(contagemDemandas.map((c) => [c.chave, c.contagem]))
  const DEMANDA_STATUS: { chave: string; label: string }[] = [
    { chave: 'atendida', label: 'Atendida' },
    { chave: 'nao_atendida', label: 'Não atendida' },
    { chave: 'aberta', label: 'Pendente' },
    { chave: 'expirada', label: 'Expirada' },
  ]
  const barrasDemandas = DEMANDA_STATUS.map((s) => ({
    status: s.chave,
    label: s.label,
    bgClass:
      s.chave === 'atendida' ? 'bg-green-500' : s.chave === 'nao_atendida' ? 'bg-red-400' : s.chave === 'expirada' ? 'bg-orange-400' : 'bg-yellow-400',
    count: mapaDemandas[s.chave] ?? 0,
    href: `${demandasHref}?statusIds=${s.chave}&dataInicio=${dataInicioStr}&dataFim=${dataFimStr}`,
  }))
  const fatiasDemandas: FatiaPizza[] = DEMANDA_STATUS.map((s) => ({
    chave: s.chave,
    label: s.label,
    valor: mapaDemandas[s.chave] ?? 0,
    cor: CORES_STATUS_DEMANDA[s.chave],
    href: `${demandasHref}?statusIds=${s.chave}&dataInicio=${dataInicioStr}&dataFim=${dataFimStr}`,
  }))

  // Sexo
  const mapaGenero = Object.fromEntries(contagemGenero.map((c) => [c.chave ?? 'nao_informado', c.contagem]))
  const GENEROS: { chave: string; label: string }[] = [
    { chave: 'masculino', label: 'Masculino' },
    { chave: 'feminino', label: 'Feminino' },
    { chave: 'outro', label: 'Outro' },
  ]
  const fatiasSexo: FatiaPizza[] = GENEROS.map((g, i) => ({
    chave: g.chave,
    label: g.label,
    valor: mapaGenero[g.chave] ?? 0,
    cor: PALETA_CATEGORICA[i],
    href: construirHref(filtrosHref, searchParams, { genero: g.chave }, ['periodo', 'inicio', 'fim']),
  }))
  if (mapaGenero['nao_informado']) {
    fatiasSexo.push({ chave: 'nao_informado', label: 'Não informado', valor: mapaGenero['nao_informado'], cor: COR_NEUTRA })
  }

  // Faixa etária
  const hoje = new Date()
  const contagemFaixas: Record<string, number> = {}
  for (const nascimento of nascimentos) {
    const faixa = calcularFaixaEtaria(calcularIdade(nascimento, hoje))
    contagemFaixas[faixa] = (contagemFaixas[faixa] ?? 0) + 1
  }
  const FAIXAS_ORDEM = ['16-24', '25-34', '35-44', '45-59', '60+']
  const fatiasIdade: FatiaPizza[] = FAIXAS_ORDEM.map((faixa, i) => ({
    chave: faixa,
    label: faixa,
    valor: contagemFaixas[faixa] ?? 0,
    cor: PALETA_CATEGORICA[i],
    href: construirHref(filtrosHref, searchParams, faixaParaQuery(faixa), ['periodo', 'inicio', 'fim']),
  }))
  if (totalSemNascimento > 0) {
    fatiasIdade.push({ chave: 'nao_informado', label: 'Não informado', valor: totalSemNascimento, cor: COR_NEUTRA })
  }

  // Escolaridade / Religião (texto livre — top 5 + Outros + Não informado)
  function fatiasTextoLivre(dados: ContagemChave[], campo: 'escolaridade' | 'religiao'): FatiaPizza[] {
    const agrupado = agruparTopEOutros(dados.map((d) => ({ chave: d.chave, contagem: d.contagem })), 5)
    return agrupado.map((f, i) => {
      const especial = f.chave === 'Outros' || f.chave === 'Não informado'
      return {
        chave: f.chave,
        label: f.chave,
        valor: f.contagem,
        cor: especial ? COR_NEUTRA : PALETA_CATEGORICA[i],
        href: especial ? undefined : construirHref(filtrosHref, searchParams, { [campo]: f.chave }, ['periodo', 'inicio', 'fim']),
      }
    })
  }
  const fatiasEscolaridade = fatiasTextoLivre(escolaridade, 'escolaridade')
  const fatiasReligiao = fatiasTextoLivre(religiao, 'religiao')

  // Regiões
  const regioesComHref = regioes.map((r) => ({
    ...r,
    href: construirHref(filtrosHref, searchParams, { regiaoId: r.id }, ['periodo', 'inicio', 'fim']),
  }))

  // Filtros ativos (badges removíveis + "Limpar tudo")
  const GENERO_LABEL: Record<string, string> = { masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro' }
  const STATUS_DEMANDA_LABEL: Record<string, string> = { pendente: 'Pendente', atendida: 'Atendida', nao_atendida: 'Não atendida' }
  const formatarDataISOParaBR = (iso: string) => iso.split('-').reverse().join('/')
  type FiltroExibivel = { chave: string; label: string; camposLimpar?: string[] }
  const filtrosAtivosExibiveis: FiltroExibivel[] = []
  if (searchParams.regiaoId) {
    const regiaoFiltrada = regioes.find((r) => r.id === searchParams.regiaoId)
    filtrosAtivosExibiveis.push({ chave: 'regiaoId', label: `Região: ${regiaoFiltrada?.nome ?? searchParams.regiaoId}` })
  }
  if (searchParams.genero) {
    filtrosAtivosExibiveis.push({ chave: 'genero', label: `Sexo: ${GENERO_LABEL[searchParams.genero] ?? searchParams.genero}` })
  }
  if (searchParams.segmentoId) {
    filtrosAtivosExibiveis.push({ chave: 'segmentoId', label: `Segmento: ${segmentoAtivo?.nome ?? searchParams.segmentoId}` })
  }
  if (searchParams.profissaoId) {
    filtrosAtivosExibiveis.push({ chave: 'profissaoId', label: `Profissão: ${profissaoAtiva?.nome ?? searchParams.profissaoId}` })
  }
  if (searchParams.escolaridade) {
    filtrosAtivosExibiveis.push({ chave: 'escolaridade', label: `Escolaridade: ${searchParams.escolaridade}` })
  }
  if (searchParams.religiao) {
    filtrosAtivosExibiveis.push({ chave: 'religiao', label: `Religião: ${searchParams.religiao}` })
  }
  if (searchParams.redeDeId) {
    filtrosAtivosExibiveis.push({ chave: 'redeDeId', label: `Rede: ${redeAtiva?.nome ?? searchParams.redeDeId}` })
  }
  if (searchParams.filtroDemandas === '1') {
    const temSubFiltro = Boolean(searchParams.areaId || searchParams.status || searchParams.dataInicio || searchParams.dataFim)
    filtrosAtivosExibiveis.push({
      chave: 'filtroDemandas',
      label: temSubFiltro ? 'Demandas: Solicitantes filtrados' : 'Demandas: Todos os solicitantes',
      camposLimpar: ['filtroDemandas', 'areaId', 'status', 'dataInicio', 'dataFim'],
    })
  }
  if (searchParams.areaId) {
    filtrosAtivosExibiveis.push({ chave: 'areaId', label: `Área: ${areaAtiva?.nome ?? searchParams.areaId}` })
  }
  if (searchParams.status) {
    filtrosAtivosExibiveis.push({ chave: 'status', label: `Status: ${STATUS_DEMANDA_LABEL[searchParams.status] ?? searchParams.status}` })
  }
  if (searchParams.dataInicio || searchParams.dataFim) {
    const label = searchParams.dataInicio && searchParams.dataFim
      ? `Período: ${formatarDataISOParaBR(searchParams.dataInicio)} a ${formatarDataISOParaBR(searchParams.dataFim)}`
      : searchParams.dataInicio
        ? `Período: a partir de ${formatarDataISOParaBR(searchParams.dataInicio)}`
        : `Período: até ${formatarDataISOParaBR(searchParams.dataFim!)}`
    filtrosAtivosExibiveis.push({ chave: 'periodoDemanda', label, camposLimpar: ['dataInicio', 'dataFim'] })
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

        <div className="flex flex-wrap gap-2">
          {(['hoje', '7dias', '30dias'] as const).map((p) => (
            <a
              key={p}
              href={construirHref(dashboardHref, searchParams, { periodo: p }, [])}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              aria-current={periodo === p ? 'true' : undefined}
            >
              {labelPeriodo[p]}
            </a>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 -mt-4">
        Período selecionado: <strong>{labelPeriodo[periodo] ?? periodo}</strong>
      </p>

      {filtrosAtivosExibiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 -mt-4">
          {filtrosAtivosExibiveis.map((f) => (
            <span
              key={f.chave}
              className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs pl-2.5 pr-1.5 py-1 rounded-full"
            >
              {f.label}
              <a
                href={construirHref(dashboardHref, searchParams, {}, f.camposLimpar ?? [f.chave])}
                className="text-gray-400 hover:text-gray-700 leading-none"
                aria-label={`Remover filtro ${f.label}`}
              >
                ×
              </a>
            </span>
          ))}
          <a
            href={construirHref(dashboardHref, searchParams, {}, [...CAMPOS_FILTRO_PESSOAS, 'filtroDemandas', ...CAMPOS_FILTRO_DEMANDAS])}
            className="text-xs text-blue-600 hover:underline"
          >
            Limpar tudo
          </a>
        </div>
      )}

      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por região</h2>
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="flex flex-col gap-2 lg:w-64 lg:shrink-0 w-full max-h-[228px] overflow-y-auto pr-1">
            {regioesComHref.map((r) => (
              <a
                key={r.id}
                href={r.href}
                className="flex items-center justify-between gap-2 bg-white rounded-lg shadow-sm px-3 py-2 hover:shadow-md transition-shadow shrink-0"
              >
                <span className="text-sm text-gray-700 truncate">
                  {r.nome}
                  {!r.ativa && <span className="ml-1 text-xs text-gray-400">(desativada)</span>}
                </span>
                <span className="text-sm font-semibold text-gray-900 shrink-0">{r.contagem}</span>
              </a>
            ))}
            {regioesComHref.length === 0 && <p className="text-sm text-gray-500">Nenhuma região cadastrada.</p>}
          </div>
          <div className="flex-1 min-w-0 w-full">
            <MapaCadastros regioes={regioesComHref} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <GraficoPizza titulo="Demandas do mês" fatias={fatiasDemandas} />
        <GraficoPizza titulo="Sexo" fatias={fatiasSexo} />
        <GraficoPizza titulo="Faixa etária" fatias={fatiasIdade} />
        <GraficoPizza titulo="Escolaridade" fatias={fatiasEscolaridade} />
        <GraficoPizza titulo="Religião" fatias={fatiasReligiao} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total pessoas</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalPessoas}</p>
          <p className="text-xs text-gray-400 mt-0.5">estado atual</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Novas no período</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{novasPessoas}</p>
          <p className="text-xs text-gray-400 mt-0.5">{labelPeriodo[periodo]}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Mobilizadores</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{totalMobilizadores}</p>
          <p className="text-xs text-gray-400 mt-0.5">ativos agora</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Colaboradores</p>
          <p className="text-3xl font-bold text-purple-600 mt-1">{totalEquipe}</p>
          <p className="text-xs text-gray-400 mt-0.5">membros</p>
        </div>
      </div>

      <GraficoDemandas barras={barrasDemandas} mesLabel={mesLabel} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por segmento</h2>
          {segmentosComContagem.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum segmento ativo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Segmento</th>
                  <th className="text-left pb-2 text-gray-600 font-medium">Tipo</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {segmentosComContagem.map((s) => (
                  <tr key={s.nome}>
                    <td className="py-2 text-gray-800">{s.nome}</td>
                    <td className="py-2 text-gray-500 capitalize">{s.tipo}</td>
                    <td className="py-2 text-right font-medium text-gray-900">{s.contagem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Ranking de mobilizadores</h2>
          <p className="text-xs text-gray-400 mb-3">Convidados no período: {labelPeriodo[periodo]}</p>
          {rankingMobilizadores.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum mobilizador ativo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Mobilizador</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Convidados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rankingMobilizadores.map((m, i) => (
                  <tr key={m.id}>
                    <td className="py-2 text-gray-800">
                      <span className="text-gray-400 mr-2 font-mono text-xs">{String(i + 1).padStart(2, '0')}</span>
                      <Link href={`${pessoaHrefBase}/${m.id}`} className="hover:underline">
                        {m.nome}
                      </Link>
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">{m.contagem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Pessoas por origem</h2>
          {pessoasPorOrigem.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum dado disponível.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-600 font-medium">Origem</th>
                  <th className="text-right pb-2 text-gray-600 font-medium">Pessoas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pessoasPorOrigem.map((o) => (
                  <tr key={o.chave ?? 'null'}>
                    <td className="py-2 text-gray-800">{o.chave ? (LABEL_ORIGEM[o.chave] ?? o.chave) : 'Não informado'}</td>
                    <td className="py-2 text-right font-medium text-gray-900">{o.contagem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
