export type FatiaPizza = {
  chave: string
  label: string
  valor: number
  cor: string
  href?: string
}

export function GraficoPizza({ titulo, fatias }: { titulo: string; fatias: FatiaPizza[] }) {
  const total = fatias.reduce((acc, f) => acc + f.valor, 0)
  let acumulado = 0
  const stops = fatias.map((f) => {
    const inicio = total > 0 ? (acumulado / total) * 360 : 0
    acumulado += f.valor
    const fim = total > 0 ? (acumulado / total) * 360 : 0
    return `${f.cor} ${inicio}deg ${fim}deg`
  })
  const gradiente = total > 0 ? `conic-gradient(${stops.join(', ')})` : '#e1e0d9'

  return (
    <section className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-3">{titulo}</h2>
      {total === 0 ? (
        <p className="text-sm text-gray-500">Nenhum dado disponível.</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="w-28 h-28 rounded-full shrink-0" style={{ background: gradiente }} aria-hidden />
          <ul className="flex-1 space-y-1.5 text-sm">
            {fatias.map((f) => {
              const conteudo = (
                <span className="flex items-center justify-between gap-2 w-full">
                  <span className="flex items-center gap-2 text-gray-700">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.cor }} aria-hidden />
                    {f.label}
                  </span>
                  <span className="font-medium text-gray-900">{f.valor}</span>
                </span>
              )
              return (
                <li key={f.chave}>
                  {f.href ? (
                    <a href={f.href} className="flex hover:underline">
                      {conteudo}
                    </a>
                  ) : (
                    <div className="flex">{conteudo}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
