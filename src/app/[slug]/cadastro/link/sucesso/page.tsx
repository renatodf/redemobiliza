import { notFound } from 'next/navigation'
import { getGabineteBySlug } from '@/lib/gabinete'

export default async function CadastroLinkSucessoPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm p-8 text-center space-y-4">
        {gabinete.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gabinete.logoUrl}
            alt={gabinete.nomeSistema}
            className="h-12 object-contain mx-auto"
          />
        )}
        <div className="text-4xl">✓</div>
        <h1 className="text-xl font-bold text-gray-900">Cadastro realizado!</h1>
        <p className="text-sm text-gray-600">
          Obrigado pelo seu cadastro. Suas informações foram registradas com sucesso.
        </p>
      </div>
    </div>
  )
}
