/**
 * Script pontual: vincula um usuário Supabase existente a um Pessoa.
 * Uso: npx tsx scripts/vincular-mobilizador.ts <email>
 *
 * Cria UsuarioGabinete (papel=mobilizador) e atualiza Pessoa.userId.
 */
import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter } as never)

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Uso: npx tsx scripts/vincular-mobilizador.ts <email>')
    process.exit(1)
  }

  // 1. Buscar usuário Supabase pelo email
  const { data: listData, error: listError } = await (supabaseAdmin.auth.admin as any).listUsers({ perPage: 1000 })
  if (listError) throw new Error('Erro ao listar usuários: ' + listError.message)

  const supabaseUser = listData.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
  if (!supabaseUser) {
    console.error(`Usuário com email "${email}" não encontrado no Supabase.`)
    console.error('Verifique se a conta foi criada corretamente.')
    process.exit(1)
  }
  console.log(`✓ Usuário Supabase encontrado: ${supabaseUser.id}`)

  // 2. Buscar Pessoa pelo email
  const pessoa = await (prisma as any).pessoa.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    include: { gabinete: { select: { id: true, slug: true, nome: true } } },
  })
  if (!pessoa) {
    console.error(`Pessoa com email "${email}" não encontrada no banco.`)
    process.exit(1)
  }
  console.log(`✓ Pessoa encontrada: ${pessoa.nome} (gabinete: ${pessoa.gabinete.nome})`)

  // 3. Atualizar Pessoa.userId
  await (prisma as any).pessoa.update({
    where: { id: pessoa.id },
    data: { userId: supabaseUser.id, isMobilizador: true },
  })
  console.log(`✓ Pessoa.userId atualizado`)

  // 4. Criar/atualizar UsuarioGabinete
  await (prisma as any).usuarioGabinete.upsert({
    where: { userId_gabineteId: { userId: supabaseUser.id, gabineteId: pessoa.gabinete.id } },
    create: { userId: supabaseUser.id, gabineteId: pessoa.gabinete.id, papel: 'mobilizador' },
    update: { papel: 'mobilizador' },
  })
  console.log(`✓ UsuarioGabinete criado/atualizado (papel: mobilizador)`)

  console.log(`\n✅ Pronto! ${pessoa.nome} pode fazer login em /${pessoa.gabinete.slug}/mobilizador/`)
}

main().catch(console.error).finally(() => (prisma as any).$disconnect())
