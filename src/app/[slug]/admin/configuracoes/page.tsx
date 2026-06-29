import { redirect } from 'next/navigation'

export default function ConfiguracoesPage({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/admin/configuracoes/demandas`)
}
