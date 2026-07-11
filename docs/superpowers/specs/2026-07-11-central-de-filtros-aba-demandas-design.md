# Central de Filtros — Aba Demandas

**Data:** 2026-07-11
**Status:** aprovado

---

## Contexto

O spec original da Central de Filtros (`docs/superpowers/specs/2026-07-11-central-de-filtros-design.md`,
11/07/2026) previa três abas: Pessoas, Demandas e Banco de Talentos. Só a aba Pessoas
foi implementada até agora (filtro + exportação PDF/Excel, com exportação assíncrona
por e-mail acima de 500 resultados). Este documento fecha o desenho da aba **Demandas**
— filtro + exportação, sem o fluxo assíncrono.

A aba **Banco de Talentos** fica fora deste documento — é bem mais complexa (ZIP de
currículos, criação em massa de `Demanda`) e vai ganhar sua própria spec depois.

## Escopo de acesso

Igual ao já definido no spec original, sem mudança:

| Papel | Escopo |
|---|---|
| Admin | Todas as Demandas do gabinete |
| Mobilizador | Só as Demandas em que ele é `responsavelId` — mesmo critério já usado em `/mobilizador/demandas` |

## Filtros

Todos combináveis (E lógico) e opcionais — sem nenhum filtro, exporta 100% do escopo
de quem pediu. Diferente da aba Pessoas, nenhum filtro aqui precisa de pós-processamento
em memória: os três cabem inteiramente num `where` do Prisma.

| Filtro | Campo | Comportamento |
|---|---|---|
| Área | `Demanda.areaId` | igualdade direta |
| Status | `Demanda.status` | "Atendida" (`atendida`) / "Não atendida" (`nao_atendida`) / "Pendente" (`status: { in: ['aberta', 'expirada'] }`) — mesmo agrupamento visual de `statusDemandaPill` |
| Região | `Demanda.solicitante.regiaoId` | relação aninhada (região da pessoa solicitante) |

`status` fora desses três valores é ignorado silenciosamente (mesmo padrão do parâmetro
`formato` na exportação de Pessoas). `deletedAt: null` é sempre aplicado (soft-delete),
igual ao resto do sistema.

**Decisão explícita**: este conjunto de filtros é deliberadamente mais enxuto que os 7
filtros já disponíveis na listagem `/admin/demandas` (que também tem responsável, prazo
alterado e período). A Central de Filtros não duplica essa listagem — é uma tela
separada, focada em exportar, com um conjunto mínimo de critérios.

## Arquitetura

### `src/lib/filtros-demandas.ts` (novo)

Espelha `src/lib/filtros-pessoas.ts`:

```typescript
export type FiltrosDemandasParams = {
  areaId?: string
  status?: 'atendida' | 'nao_atendida' | 'pendente'
  regiaoId?: string
}

export function buildWhereDemandas(
  gabineteId: string,
  filtros: FiltrosDemandasParams,
  responsavelId?: string  // presente = escopo de mobilizador
): Prisma.DemandaWhereInput
```

Sem função de pós-filtro equivalente a `aplicarFiltrosPosConsulta` — não é necessária
aqui, já que todos os filtros de Demanda são expressáveis direto no `where`.

**Decisão explícita**: optou-se por um módulo dedicado (em vez de montar o `where`
inline no `page.tsx`/`route.ts`, como a listagem `/admin/demandas` já faz hoje) porque
a mesma lógica de filtro precisa ser reaproveitada em três lugares — tela do admin,
tela do mobilizador e rota de exportação — igual já acontece com `buildWherePessoas`.
Um módulo só, testado uma vez, evita divergência entre esses três consumidores.

### Rotas e componentes

```
src/app/[slug]/admin/filtros/demandas/page.tsx       # novo
src/app/[slug]/admin/filtros/DemandasFiltro.tsx       # novo, compartilhado com mobilizador
src/app/[slug]/mobilizador/filtros/demandas/page.tsx  # novo
src/app/api/[slug]/filtros/demandas/exportar/route.ts # novo
```

`FiltrosTabs.tsx` (já existe, compartilhado por admin e mobilizador) ganha `href` na
aba "Demandas" nos dois `page.tsx` já existentes (`admin/filtros/page.tsx` e
`mobilizador/filtros/page.tsx`) — hoje ela é um `<span>` desabilitado ("Em breve") e
passa a virar um `<Link>` de verdade.

`DemandasFiltro.tsx` segue o mesmo layout de `PessoasFiltro.tsx`: paginação de 20 itens,
botão "Limpar filtro", mesmo padrão visual (`corPrimaria`/`corTextoContraste`).

## Exportação

**Decisão explícita (confirmada com o usuário)**: a exportação de Demandas é **sempre
síncrona** — sem o limite de 500 registros nem o fluxo assíncrono por e-mail que a
aba Pessoas ganhou em 11/07. Volume de Demandas por gabinete é tipicamente muito menor
que Pessoas; a complexidade extra (storage, link assinado, e-mail) não se justifica
aqui. Se algum dia isso mudar, o padrão já existe pronto pra ser reaproveitado
(`LIMITE_EXPORT_SINCRONO`, `uploadExportacaoESaerAssinada`, `templateExportacaoPronta`).

### `src/lib/exportar-demandas.ts` (novo)

Espelha `src/lib/exportar-pessoas.ts` (mesmas libs `exceljs`/`pdf-lib`):

```typescript
export type DemandaExportavel = {
  titulo: string
  area: { nome: string }
  status: string
  solicitante: { nome: string }
  responsavel: { nome: string }
  prazoDesfecho: Date
}

export async function gerarExcelDemandas(demandas: DemandaExportavel[]): Promise<Buffer>
export async function gerarPdfDemandas(demandas: DemandaExportavel[]): Promise<Buffer>
```

Colunas do arquivo: Título, Área, Status (label amigável via `statusDemandaPill` — nunca
o valor cru como `nao_atendida`), Solicitante, Responsável, Prazo
(`toLocaleDateString('pt-BR')`).

### `GET /api/[slug]/filtros/demandas/exportar` (novo)

```typescript
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  // Mesma autorização dupla (assertAdminAccess → assertMobilizadorAccess → 403)
  // já usada em .../pessoas/exportar/route.ts
  const where = buildWhereDemandas(gabineteId, filtros, responsavelId)
  const demandas = await prisma.demanda.findMany({ where, select: {...}, orderBy: { criadoEm: 'desc' } })
  // formato=excel → gerarExcelDemandas, senão gerarPdfDemandas
  // mesmos headers Content-Disposition já usados na exportação de Pessoas
}
```

Estrutura idêntica à rota de exportação de Pessoas, só que sem o branch assíncrono —
sempre gera e retorna o arquivo na mesma resposta HTTP.

## Testes

- `filtros-demandas.test.ts` (espelha `filtros-pessoas.test.ts`): cada filtro isolado;
  combinação de filtros; o agrupamento "pendente" bate `aberta` e `expirada` e exclui
  `atendida`/`nao_atendida`; escopo do mobilizador (`responsavelId` sempre aplicado
  quando presente); ausência de filtro retorna o escopo completo; `gabineteId` sempre
  presente no `where` (isolamento de tenant).
- `exportar-demandas.test.ts` (espelha `exportar-pessoas.test.ts`): gera buffer não
  vazio pra PDF e Excel, inclusive com lista vazia de demandas (0 resultados não deve
  quebrar a geração — mesmo comportamento já confirmado em Pessoas).

## Casos de borda

- **`regiaoId`/`areaId` de outro gabinete**: não precisa de validação extra — como o
  `where` sempre combina `gabineteId` no nível de `Demanda`, um ID de outro tenant só
  resulta em zero resultados, nunca vazamento (mesmo raciocínio já vale hoje pros
  filtros de Pessoas).
- **`status` fora do enum esperado**: ignorado silenciosamente, filtro não aplicado.
- **Autorização**: mesmo padrão duplo-catch já usado na exportação de Pessoas — falha
  em `assertAdminAccess` cai pra tentar `assertMobilizadorAccess`; falha em ambos
  retorna 403.

## Fora de escopo

- Aba Banco de Talentos — spec separada.
- Qualquer mudança na listagem `/admin/demandas` existente (ela continua com seus 7
  filtros, sem relação com esta tela).
- Exportação assíncrona por e-mail para Demandas (ver decisão explícita acima).
