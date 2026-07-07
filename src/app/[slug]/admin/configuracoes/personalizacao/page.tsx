import { notFound } from 'next/navigation'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { salvarPersonalizacao } from '@/actions/admin/salvar-personalizacao'
import { uploadLogo } from '@/actions/admin/upload-logo'
import { uploadBanner } from '@/actions/admin/upload-banner'

export default async function PersonalizacaoConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
      <h2 className="text-base font-semibold">Personalização do Layout</h2>

      <form action={salvarPersonalizacao} className="space-y-4">
        <input type="hidden" name="slug" value={params.slug} />
        <div>
          <label className="block text-sm font-medium text-gray-700">Nome do sistema</label>
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
          style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          className="px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
        >
          Salvar
        </button>
      </form>

      <div className="border-t border-gray-100 pt-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Logo</h3>
        {gabinete.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gabinete.logoUrl} alt="Logo atual" className="h-16 object-contain" />
        )}
        <form action={uploadLogo} encType="multipart/form-data">
          <input type="hidden" name="slug" value={params.slug} />
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block text-sm" />
          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="mt-2 px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            Enviar logo
          </button>
        </form>
      </div>

      <div className="border-t border-gray-100 pt-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Banner</h3>
        {gabinete.imagemBannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gabinete.imagemBannerUrl} alt="Banner atual" className="w-full h-32 object-cover rounded" />
        )}
        <form action={uploadBanner} encType="multipart/form-data">
          <input type="hidden" name="slug" value={params.slug} />
          <input name="banner" type="file" accept="image/png,image/jpeg,image/webp" className="block text-sm" />
          <button
            type="submit"
            style={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
            className="mt-2 px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            Enviar banner
          </button>
        </form>
      </div>
    </div>
  )
}
