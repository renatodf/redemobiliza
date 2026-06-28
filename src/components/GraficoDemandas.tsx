type Barra = {
  status: string
  label: string
  count: number
  bgClass: string
  href: string
}

type Props = {
  barras: Barra[]
  titulo?: string
  mesLabel: string
}

export function GraficoDemandas({ barras, titulo, mesLabel }: Props) {
  const max = Math.max(...barras.map((b) => b.count), 1)

  return (
    <section className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-gray-800">
          {titulo ?? 'Demandas do mês'}
        </h2>
      </div>
      <p className="text-xs text-gray-400 mb-5">{mesLabel} — clique numa barra para filtrar</p>
      <div className="flex items-end gap-3 h-40">
        {barras.map((b) => {
          const heightPct =
            b.count === 0 ? 2 : Math.max((b.count / max) * 100, 8)
          return (
            <a
              key={b.status}
              href={b.href}
              className="flex flex-col items-center flex-1 gap-2 group"
              title={`${b.label}: ${b.count}`}
            >
              <span className="text-sm font-bold text-gray-700">{b.count}</span>
              <div
                className={`w-full rounded-t-md transition-opacity group-hover:opacity-70 ${b.bgClass}`}
                style={{ height: `${heightPct}%` }}
              />
              <span className="text-xs text-gray-500 text-center leading-tight">
                {b.label}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}
