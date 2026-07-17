import { notFound } from 'next/navigation'
import { getGabineteBySlug } from '@/lib/gabinete'
import { salvarPersonalizacao } from '@/actions/admin/salvar-personalizacao'
import { uploadLogo } from '@/actions/admin/upload-logo'
import { uploadBanner } from '@/actions/admin/upload-banner'
import UploadImagemGabineteForm from '@/components/admin/UploadImagemGabineteForm'
import SalvarPersonalizacaoForm from '@/components/admin/SalvarPersonalizacaoForm'

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
        <SalvarPersonalizacaoForm
          slug={params.slug}
          nomeSistema={gabinete.nomeSistema ?? ''}
          corPrimaria={gabinete.corPrimaria ?? '#3B82F6'}
          corSecundaria={gabinete.corSecundaria ?? '#1E40AF'}
          acao={salvarPersonalizacao}
        />
      </section>

      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Logo</h2>
        {gabinete.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gabinete.logoUrl} alt="Logo atual" className="h-16 object-contain" />
        )}
        <UploadImagemGabineteForm slug={params.slug} campo="logo" acao={uploadLogo} botaoLabel="Enviar logo" />
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
        <UploadImagemGabineteForm slug={params.slug} campo="banner" acao={uploadBanner} botaoLabel="Enviar banner" />
      </section>
    </div>
  )
}
