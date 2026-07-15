import { CAMPOS_FILTRO_DEMANDAS } from '@/lib/filtros-ativos'

export default function VisualizarDadosGeraisDemandasButton({
  dashboardHref,
  searchParams,
  corPrimaria,
}: {
  dashboardHref: string
  searchParams: Record<string, string | undefined>
  corPrimaria: string
}) {
  const qs = new URLSearchParams()
  qs.set('filtroDemandas', '1')
  for (const campo of CAMPOS_FILTRO_DEMANDAS) {
    const valor = searchParams[campo]
    if (valor) qs.set(campo, valor)
  }

  return (
    <a
      href={`${dashboardHref}?${qs.toString()}`}
      style={{ backgroundColor: corPrimaria }}
      className="text-white text-[11px] px-2.5 py-1 rounded-md hover:opacity-90 font-medium"
    >
      Visualizar Dados Gerais
    </a>
  )
}
