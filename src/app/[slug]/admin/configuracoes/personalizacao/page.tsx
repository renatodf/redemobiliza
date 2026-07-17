import { notFound } from 'next/navigation'
import { getGabineteBySlug } from '@/lib/gabinete'
import { corTextoContraste } from '@/lib/cor-contraste'
import { salvarPersonalizacao } from '@/actions/admin/salvar-personalizacao'
import { uploadLogo } from '@/actions/admin/upload-logo'
import UploadImagemGabineteForm from '@/components/admin/UploadImagemGabineteForm'
import SalvarPersonalizacaoForm from '@/components/admin/SalvarPersonalizacaoForm'

export default async function PersonalizacaoConfigPage({ params }: { params: { slug: string } }) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()
  const corTexto = corTextoContraste(gabinete.corPrimaria)

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
      <h2 className="text-base font-semibold">Personalização do Layout</h2>

      <SalvarPersonalizacaoForm
        slug={params.slug}
        nomeSistema={gabinete.nomeSistema ?? ''}
        corPrimaria={gabinete.corPrimaria ?? '#3B82F6'}
        corSecundaria={gabinete.corSecundaria ?? '#1E40AF'}
        acao={salvarPersonalizacao}
        botaoStyle={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
        botaoClassName="px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
      />

      <div className="border-t border-gray-100 pt-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Logo</h3>
        <div className="flex items-start gap-4">
          {gabinete.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gabinete.logoUrl} alt="Logo atual" className="h-16 object-contain" />
          )}
          <p className="text-xs text-gray-500 max-w-xs">
            Imagem quadrada, mínimo 200×200px (recomendado 400×400px). Ela aparece em um
            círculo no menu lateral, então evite conteúdo importante perto das bordas.
          </p>
        </div>
        <UploadImagemGabineteForm
          slug={params.slug}
          campo="logo"
          acao={uploadLogo}
          botaoLabel="Enviar logo"
          botaoStyle={{ backgroundColor: gabinete.corPrimaria, color: corTexto }}
          botaoClassName="mt-2 px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
        />
      </div>
    </div>
  )
}
