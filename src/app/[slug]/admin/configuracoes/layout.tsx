import ConfiguracoesSidebar from './ConfiguracoesSidebar'

export default function ConfiguracoesLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>
      <div className="flex flex-col md:flex-row gap-6">
        <ConfiguracoesSidebar slug={params.slug} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
