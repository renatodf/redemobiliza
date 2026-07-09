import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { getGabineteBySlug } from '@/lib/gabinete'
import EditarPessoaForm from '../../admin/pessoas/[pessoaId]/EditarPessoaForm'
import AlterarSenhaDialog from '../AlterarSenhaDialog'

export default async function MobilizadorPerfilPage({
  params,
}: {
  params: { slug: string }
}) {
  const gabinete = await getGabineteBySlug(params.slug)
  if (!gabinete) notFound()

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) notFound()

  const pessoa = await prisma.pessoa.findFirst({
    where: { userId: session.user.id, gabineteId: gabinete.id, isMobilizador: true },
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      email: true,
      genero: true,
      regiaoId: true,
      profissaoId: true,
      cpf: true,
      telefoneFixo: true,
      orientacaoSexual: true,
      religiao: true,
      escolaridade: true,
    },
  })
  if (!pessoa) notFound()

  const [regioes, profissoes] = await Promise.all([
    prisma.regiao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.profissao.findMany({
      where: { gabineteId: gabinete.id, ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
      <section className="bg-white rounded-lg p-6 shadow-sm space-y-4">
        <EditarPessoaForm
          slug={params.slug}
          pessoaId={pessoa.id}
          pessoa={{
            nome: pessoa.nome,
            whatsapp: pessoa.whatsapp,
            email: pessoa.email,
            regiaoId: pessoa.regiaoId,
            profissaoId: pessoa.profissaoId,
            genero: pessoa.genero,
            cpf: pessoa.cpf,
            telefoneFixo: pessoa.telefoneFixo,
            orientacaoSexual: pessoa.orientacaoSexual,
            religiao: pessoa.religiao,
            escolaridade: pessoa.escolaridade,
          }}
          regioes={regioes}
          profissoes={profissoes}
          corPrimaria={gabinete.corPrimaria}
        />
        <div className="pt-2">
          <AlterarSenhaDialog />
        </div>
      </section>
    </div>
  )
}
