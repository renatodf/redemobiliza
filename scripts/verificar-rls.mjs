#!/usr/bin/env node
// Verifica se toda tabela com RLS habilitado (pg_class.relrowsecurity) tem
// ao menos uma política (pg_policies) — detecta a divergência descoberta na
// auditoria de terceira ordem (2026-07-17): RLS habilitado sem nenhuma
// política em produção e staging, nunca detectado porque as duas auditorias
// anteriores liam scripts/setup-supabase.sql como fonte de verdade em vez
// de consultar o banco real.
//
// Uso: DIRECT_URL=... node scripts/verificar-rls.mjs
// Ou:  set -a; source .env.staging; set +a; node scripts/verificar-rls.mjs
//
// Não faz parte de `npm test` — é um verificador de estado de banco, não um
// teste de unidade, e este projeto não roda testes contra banco real em CI.
// Rodar manualmente depois de qualquer migration/deploy que toque RLS.

import { Client } from 'pg'

const TABELAS_DENY_ALL_INTENCIONAL = new Set(['LogSuporte', '_prisma_migrations'])

async function main() {
  const connectionString = process.env.DIRECT_URL
  if (!connectionString) {
    console.error('DIRECT_URL não definido. Rode: set -a; source .env.staging; set +a; node scripts/verificar-rls.mjs')
    process.exit(1)
  }

  const client = new Client({ connectionString })
  await client.connect()

  const { rows: tabelasComRls } = await client.query(`
    SELECT relname
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity = true
    ORDER BY relname
  `)
  const { rows: tabelasComPolicy } = await client.query(`
    SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'
  `)
  await client.end()

  const comPolicy = new Set(tabelasComPolicy.map((r) => r.tablename))
  const semPolicy = tabelasComRls
    .map((r) => r.relname)
    .filter((nome) => !comPolicy.has(nome) && !TABELAS_DENY_ALL_INTENCIONAL.has(nome))

  if (semPolicy.length > 0) {
    console.error('DIVERGÊNCIA ENCONTRADA — tabelas com RLS habilitado e ZERO políticas:')
    for (const nome of semPolicy) console.error(`  - ${nome}`)
    console.error('\nIsso significa deny-all silencioso para qualquer acesso via anon/authenticated key.')
    console.error('Reaplique scripts/setup-supabase.sql ou investigue por que a política não existe.')
    process.exit(1)
  }

  console.log(`OK — ${tabelasComRls.length} tabelas com RLS habilitado, todas com ao menos 1 política (exceto: ${[...TABELAS_DENY_ALL_INTENCIONAL].join(', ')}, deny-all intencional).`)
}

main().catch((e) => {
  console.error('Erro ao verificar RLS:', e)
  process.exit(1)
})
