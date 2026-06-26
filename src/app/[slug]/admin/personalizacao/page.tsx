import { notFound } from 'next/navigation'
import { getGabineteBySlug } from '@/lib/gabinete'
import { salvarPersonalizacao } from '@/actions/admin/salvar-personalizacao'
import { uploadLogo } from '@/actions/admin/upload-logo'
import { uploadBanner } from '@/actions/admin/upload-banner'

export default async function PersonalizacaoPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      <h1 className="text-2xl font-bold">Personalização</h1>

      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Identidade</h2>
        <form action={salvarPersonalizacao} className="space-y-4">
          <input type="hidden" name="slug" value={params.slug} />
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nome do sistema
            </label>
            <input
              name="nomeSistema"
              defaultValue={gabinete.nomeSistema ?? ''}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Ex: Mobiliza Fulano"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Cor primária</label>
              <input
                name="corPrimaria"
                type="color"
                defaultValue={gabinete.corPrimaria ?? '#3B82F6'}
                className="mt-1 h-10 w-full border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Cor secundária</label>
              <input
                name="corSecundaria"
                type="color"
                defaultValue={gabinete.corSecundaria ?? '#1E40AF'}
                className="mt-1 h-10 w-full border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Salvar
          </button>
        </form>
      </section>

      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Logo</h2>
        {gabinete.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gabinete.logoUrl} alt="Logo atual" className="h-16 object-contain" />
        )}
        <form action={uploadLogo} encType="multipart/form-data">
          <input type="hidden" name="slug" value={params.slug} />
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="block text-sm"
          />
          <button
            type="submit"
            className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Enviar logo
          </button>
        </form>
      </section>

      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Banner</h2>
        {gabinete.imagemBannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gabinete.imagemBannerUrl}
            alt="Banner atual"
            className="w-full h-32 object-cover rounded"
          />
        )}
        <form action={uploadBanner} encType="multipart/form-data">
          <input type="hidden" name="slug" value={params.slug} />
          <input
            name="banner"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="block text-sm"
          />
          <button
            type="submit"
            className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Enviar banner
          </button>
        </form>
      </section>
    </div>
  )
}
