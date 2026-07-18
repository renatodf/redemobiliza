# Importação Izalci — Fase 2: Catálogos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popular os 4 catálogos (`Regiao`, `Profissao`, `Segmento`, `AreaColocacao`) do gabinete IZALCI a partir das tags do backup MongoDB, aplicando as fusões e a hierarquia de região já confirmadas no spec.

**Architecture:** Dois estágios com um artefato intermediário revisável entre eles: (1) script Python decodifica o backup, aplica fusões/hierarquia e escreve um JSON; (2) script TypeScript lê esse JSON e cria os registros via Prisma Client direto, primeiro contra um gabinete de teste em staging (validação mecânica do script), depois contra o gabinete IZALCI em produção.

**Tech Stack:** Python 3.8 + `bson` (já usado nesta sessão), TypeScript via `npx tsx` + Prisma 7.8 (`adapter-pg`), Nominatim (geocodificação, reaproveitando `src/lib/geocodificar-regiao.ts`).

## Global Constraints

- Fonte: `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/tags.bson.gz` e `people.bson.gz` (só usado para o passo 3 da hierarquia de bairros).
- Tenant Izalci: `ObjectId("60b7934c0cc64a0004717e9d")`.
- `scripts/importacao-izalci/` é committado no git — nenhum dos arquivos contém dado pessoal (só nomes de lugar/segmento/profissão/cargo).
- `.env.local`/`.env.production` apontam para o **mesmo banco real de produção** — não existe banco de sandbox separado de produção. Staging (`.env.staging`) é um projeto Supabase à parte.
- Scripts standalone usam `PrismaClient` direto (nunca Server Actions, que exigem sessão HTTP) — mesmo padrão de `scripts/vincular-mobilizador.ts`: `import { PrismaClient } from '../../src/generated/prisma/client'`, `import { PrismaPg } from '@prisma/adapter-pg'`, `dotenv.config({ path: '.env.local' })`, `new PrismaPg(process.env.DATABASE_URL!)`. Para rodar contra staging, faz `set -a; source .env.staging; set +a` **antes** do `npx tsx` — o `dotenv.config` não sobrescreve variável de ambiente já setada pelo shell, então o valor do `source` vale.
- Regras de criação de catálogo idênticas às Server Actions existentes (mesmos campos obrigatórios): `Profissao` — `{ nome, gabineteId, ativa: true }`, dedup por `nome` case-insensitive + `ativa: true`. `Segmento` — `{ nome, slug: toSlug(nome), gabineteId, tipo: 'geral', status: 'ativo' }`, dedup por `slug` + `status:'ativo'`. `AreaColocacao` — `{ nome, gabineteId, status: 'ativa' }`, dedup por `nome` exato (sem `mode:'insensitive'`, diferente dos outros três). `Regiao` — `{ nome, uf, gabineteId, ativa: true, regiaoPaiId }`, dedup por `nome` case-insensitive + `ativa: true`.
- **Achado desta sessão de planejamento**: `criarGabinete` já chama `seedRegioes`, que cria ~20 dos mesmos nomes de cidade do DF (ex. `Lago Norte`, `Cruzeiro`, `Sudoeste/Octogonal`, `Guará`, `Taguatinga`, `Ceilândia`, `Sobradinho`, `Sobradinho II`) como `Regiao` soltas, sem `uf`/`regiaoPaiId`/coordenada. O script de importação de `Regiao` (Task 2) **nunca pode pular** um nome já existente — sempre completa os campos que estiverem faltando (`uf`, `regiaoPaiId`, geocodificação) no registro já existente, em vez de só criar quando não existe.
- Geocodificação: `geocodificarRegiao(nome, uf)` de `src/lib/geocodificar-regiao.ts` **não** tem rate limit embutido — quem chama em loop precisa espaçar as chamadas em 1 segundo, senão viola a política de uso do Nominatim.
- `npx tsx` já é o executor de script padrão do projeto (visto em `scripts/vincular-mobilizador.ts`) — sem necessidade de instalar nada novo para os scripts TypeScript.
- Sem testes automatizados (scripts de execução única, mesmo padrão da Fase 1) — validação é manual, por contagem exata e amostragem.

---

### Task 1: Script Python de extração dos catálogos

**Files:**
- Create: `scripts/importacao-izalci/extrair_catalogos.py`
- Create (output, committed): `scripts/importacao-izalci/catalogos-fase2.json`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `catalogos-fase2.json` com o formato `{ "profissoes": string[], "areasColocacao": string[], "segmentos": string[], "cidades": string[], "bairros": [{ "nome": string, "cidadeMae": string | null, "metodoResolucao": "parenteses" | "substring" | "coocorrencia" | null }] }`. A Task 2 lê esse arquivo literalmente por esse formato.

- [ ] **Step 1: Criar o diretório e o script**

Criar `scripts/importacao-izalci/extrair_catalogos.py`:

```python
"""
Script pontual: extrai os catálogos da Fase 2 (Regiao/Profissao/Segmento/
AreaColocacao) do backup MongoDB do Izalci, aplica as fusões e a hierarquia
de região já confirmadas no spec, e escreve um JSON revisável.

Uso: python3 scripts/importacao-izalci/extrair_catalogos.py
Saída: scripts/importacao-izalci/catalogos-fase2.json
"""
import gzip
import json
import re
import unicodedata
from collections import defaultdict, Counter

import bson
from bson.codec_options import CodecOptions, DatetimeConversion

TAGS_SRC = "/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/tags.bson.gz"
PEOPLE_SRC = "/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/people.bson.gz"
OUT_PATH = "scripts/importacao-izalci/catalogos-fase2.json"
TENANT_IZALCI = bson.ObjectId("60b7934c0cc64a0004717e9d")
OPTS = CodecOptions(datetime_conversion=DatetimeConversion.DATETIME_AUTO)

SEGMENT_MERGES = {
    "ABEDUQ - CHEQUE-EDUCAÇÃO": "ABEDUQ",
    "B. UNIVERSITARIA": "BOLSA UNIVERSITÁRIA",
    "CRC-DF": "CRC-DF - CONSELHO REGIONAL DE CONTABILIDADE",
    "TELECENTROS - DF DIGITAL": "DF DIGITAL",
}

CITY_MERGES = {
    "Sol Nascente/Pôr do Sol": "Sol Nascente - Pôr do Sol",
    "Guará / Lúcio Costa": "Guará",
}

NEIGHBORHOOD_MERGES = {
    "Valparaíso de Goias": "Valparaíso de Goiás",
}


def norm(s):
    s = (s or "").upper().strip()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^A-Z0-9]+", " ", s).strip()
    return s


def load_tags_by_type():
    by_type = defaultdict(list)
    with gzip.open(TAGS_SRC, "rb") as f:
        for doc in bson.decode_file_iter(f, codec_options=OPTS):
            if doc.get("tenant_id") != TENANT_IZALCI:
                continue
            by_type[doc.get("type")].append(doc)
    return by_type


def apply_merges(labels, merges):
    return sorted({merges.get(label, label) for label in labels})


def build_neighborhood_hierarchy(city_labels_final, neighborhood_docs):
    city_norms = sorted({norm(c) for c in city_labels_final if len(norm(c)) >= 4}, key=len, reverse=True)
    norm_to_city_label = {norm(c): c for c in city_labels_final}

    def resolve_textual(label):
        m = re.search(r"\(([^)]+)\)\s*$", label or "")
        if m:
            content = norm(m.group(1))
            for cn in city_norms:
                if cn in content:
                    return cn, "parenteses"
        nn = norm(label)
        for cn in city_norms:
            if nn == cn or nn.startswith(cn + " ") or (" " + cn) in nn:
                return cn, "substring"
        return None, None

    by_final_name = defaultdict(list)
    for doc in neighborhood_docs:
        label = doc.get("label") or ""
        final_name = NEIGHBORHOOD_MERGES.get(label, label)
        by_final_name[final_name].append(doc["_id"])

    resultado_por_nome = {}
    for final_name in by_final_name:
        cn, metodo = resolve_textual(final_name)
        cidade_mae = norm_to_city_label.get(cn) if cn else None
        resultado_por_nome[final_name] = {"nome": final_name, "cidadeMae": cidade_mae, "metodoResolucao": metodo}

    return resultado_por_nome, by_final_name


def resolve_by_cooccurrence(resultado_por_nome, ids_por_nome, city_docs, city_label_by_id_final):
    brasilia_id = next((d["_id"] for d in city_docs if norm(d.get("label")) == "BRASILIA"), None)
    pendentes = {nome for nome, r in resultado_por_nome.items() if r["cidadeMae"] is None}
    id_to_nome = {}
    for nome in pendentes:
        for i in ids_por_nome[nome]:
            id_to_nome[i] = nome

    co = defaultdict(Counter)
    usage = Counter()
    with gzip.open(PEOPLE_SRC, "rb") as f:
        for doc in bson.decode_file_iter(f, codec_options=OPTS):
            if doc.get("tenant_id") != TENANT_IZALCI:
                continue
            tag_ids = doc.get("tag_ids") or []
            cities_here = [t for t in tag_ids if t in city_label_by_id_final and t != brasilia_id]
            neighs_here = [id_to_nome[t] for t in tag_ids if t in id_to_nome]
            for nome in neighs_here:
                usage[nome] += 1
                for cid in cities_here:
                    co[nome][cid] += 1

    for nome in pendentes:
        total = usage[nome]
        if not co[nome] or total == 0:
            continue
        top_cid, top_count = co[nome].most_common(1)[0]
        if top_count / total >= 0.5 and top_count >= 3:
            resultado_por_nome[nome]["cidadeMae"] = city_label_by_id_final[top_cid]
            resultado_por_nome[nome]["metodoResolucao"] = "coocorrencia"


def main():
    by_type = load_tags_by_type()

    profissoes = apply_merges([d.get("label") for d in by_type["Profession"]], {})
    areas_colocacao = apply_merges([d.get("label") for d in by_type["EmploymentRole"]], {})
    segmentos = apply_merges([d.get("label") for d in by_type["Segment"]], SEGMENT_MERGES)

    city_docs = by_type["City"]
    city_labels_final = apply_merges([d.get("label") for d in city_docs], CITY_MERGES)
    city_label_by_id_final = {d["_id"]: CITY_MERGES.get(d.get("label"), d.get("label")) for d in city_docs}

    neighborhood_docs = by_type["Neighborhood"]
    resultado_por_nome, ids_por_nome = build_neighborhood_hierarchy(city_labels_final, neighborhood_docs)
    resolve_by_cooccurrence(resultado_por_nome, ids_por_nome, city_docs, city_label_by_id_final)

    bairros = sorted(resultado_por_nome.values(), key=lambda r: r["nome"])

    saida = {
        "profissoes": profissoes,
        "areasColocacao": areas_colocacao,
        "segmentos": segmentos,
        "cidades": city_labels_final,
        "bairros": bairros,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=2)

    com_pai = sum(1 for b in bairros if b["cidadeMae"])
    sem_pai = len(bairros) - com_pai
    print(
        f"profissoes={len(profissoes)} areasColocacao={len(areas_colocacao)} "
        f"segmentos={len(segmentos)} cidades={len(city_labels_final)} "
        f"bairros={len(bairros)} (com_pai={com_pai} sem_pai={sem_pai})"
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Rodar o script**

```bash
cd /Users/renato/Documents/meubd
python3 scripts/importacao-izalci/extrair_catalogos.py
```

Expected: `profissoes=232 areasColocacao=100 segmentos=203 cidades=75 bairros=408 (com_pai=283 sem_pai=125)`

- [ ] **Step 3: Validar o JSON gerado contra os achados do spec**

```bash
cd /Users/renato/Documents/meubd
python3 -c "
import json
d = json.load(open('scripts/importacao-izalci/catalogos-fase2.json', encoding='utf-8'))
assert len(d['profissoes']) == 232
assert len(d['areasColocacao']) == 100
assert len(d['segmentos']) == 203
assert len(d['cidades']) == 75
assert len(d['bairros']) == 408
assert 'ABEDUQ' in d['segmentos'] and 'ABEDUQ - CHEQUE-EDUCAÇÃO' not in d['segmentos']
assert 'BOLSA UNIVERSITÁRIA' in d['segmentos'] and 'B. UNIVERSITARIA' not in d['segmentos']
assert 'CRC-DF - CONSELHO REGIONAL DE CONTABILIDADE' in d['segmentos'] and 'CRC-DF' not in d['segmentos']
assert 'DF DIGITAL' in d['segmentos'] and 'TELECENTROS - DF DIGITAL' not in d['segmentos']
assert 'BANCO ANTIGO' in d['segmentos']
assert 'Sol Nascente - Pôr do Sol' in d['cidades'] and 'Sol Nascente/Pôr do Sol' not in d['cidades']
assert 'Guará' in d['cidades'] and 'Guará / Lúcio Costa' not in d['cidades']
nomes_bairro = [b['nome'] for b in d['bairros']]
assert 'Valparaíso de Goiás' in nomes_bairro and 'Valparaíso de Goias' not in nomes_bairro
por_nome = {b['nome']: b for b in d['bairros']}
assert por_nome['Ceilândia  norte']['cidadeMae'] == 'Ceilândia'
# 'Riacho Fundo II' existe como tag Neighborhood E como tag City com o mesmo
# nome (bairro central que dá nome à própria RA) — resolve para si mesma.
assert por_nome['Riacho Fundo II']['cidadeMae'] == 'Riacho Fundo II'
print('OK — todas as verificações passaram')
"
```

Expected: `OK — todas as verificações passaram`

- [ ] **Step 4: Commit**

```bash
cd /Users/renato/Documents/meubd
git add scripts/importacao-izalci/extrair_catalogos.py scripts/importacao-izalci/catalogos-fase2.json
git commit -m "$(cat <<'EOF'
feat: extração dos catálogos da Fase 2 da importação Izalci

Script Python decodifica tags.bson.gz do backup, aplica as 7 fusões
já confirmadas (4 Segmento, 2 Cidade, 1 Bairro) e resolve a hierarquia
de bairro->cidade em 3 níveis de confiança (283 de 408 bairros com
cidade-mãe). catalogos-fase2.json é o artefato revisável antes da
escrita real no Postgres (Task 2).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Script TypeScript de importação para o Postgres

**Files:**
- Create: `scripts/importacao-izalci/importar-catalogos-fase2.ts`

**Interfaces:**
- Consumes: `scripts/importacao-izalci/catalogos-fase2.json` (Task 1) — formato `{ profissoes: string[], areasColocacao: string[], segmentos: string[], cidades: string[], bairros: {nome, cidadeMae, metodoResolucao}[] }`.
- Produces: nada consumido por outra task — a Task 3 só executa este script, não importa nenhuma função dele.

- [ ] **Step 1: Criar o script**

Criar `scripts/importacao-izalci/importar-catalogos-fase2.ts`:

```typescript
/**
 * Script pontual: importa os catálogos da Fase 2 (Regiao/Profissao/Segmento/
 * AreaColocacao) a partir de scripts/importacao-izalci/catalogos-fase2.json
 * para um gabinete específico.
 *
 * Uso: npx tsx scripts/importacao-izalci/importar-catalogos-fase2.ts <slug-do-gabinete>
 */
import { PrismaClient } from '../../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { toSlug } from '../../src/lib/slug'
import { geocodificarRegiao } from '../../src/lib/geocodificar-regiao'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter } as never)

type Bairro = { nome: string; cidadeMae: string | null; metodoResolucao: string | null }
type Catalogos = {
  profissoes: string[]
  areasColocacao: string[]
  segmentos: string[]
  cidades: string[]
  bairros: Bairro[]
}

// UF de cada cidade final (pós-fusão). As 34 primeiras são do DF (confirmado
// pelo usuário em sessão de revisão manual das 77 tags City originais). As
// 41 seguintes são de fora do DF — mapeadas por conhecimento geográfico
// geral; as marcadas "baixa confiança" merecem checagem antes de rodar
// contra produção (nomes ambíguos ou pouco comuns). 'Entorno do DF' não é
// um município real — fica sem UF de propósito, geocodificação vai falhar
// pra ela e não é bloqueante (mesmo tratamento de erro do resto do script).
const UF_POR_CIDADE: Record<string, string> = {
  // DF (34)
  'Arniqueira': 'DF', 'Brasília': 'DF', 'Brazlândia': 'DF', 'Candangolândia': 'DF',
  'Ceilândia': 'DF', 'Cruzeiro': 'DF', 'Fercal': 'DF', 'Gama': 'DF', 'Guará': 'DF',
  'Itapoã': 'DF', 'Jardim Botânico': 'DF', 'Lago Norte': 'DF', 'Lago Sul': 'DF',
  'Núcleo Bandeirante': 'DF', 'Paranoá': 'DF', 'Park Way': 'DF', 'Planaltina': 'DF',
  'Plano Piloto': 'DF', 'Recanto das Emas': 'DF', 'Riacho Fundo': 'DF', 'Riacho Fundo II': 'DF',
  'Samambaia': 'DF', 'Santa Maria': 'DF', 'SCIA': 'DF', 'SIA': 'DF', 'Sobradinho': 'DF',
  'Sobradinho II': 'DF', 'Sol Nascente - Pôr do Sol': 'DF', 'Sudoeste/Octogonal': 'DF',
  'São Sebastião': 'DF', 'Taguatinga': 'DF', 'Varjão': 'DF', 'Vicente Pires': 'DF', 'Águas Claras': 'DF',
  // fora do DF (39 — 'Entorno do DF' fica de fora de propósito, ver comentário acima)
  'Anápolis': 'GO', 'Aracaju': 'SE', 'Barretos': 'SP', 'Barueri': 'SP', 'Catalão': 'GO',
  'Ceres': 'GO', 'Cidade Ocidental': 'GO', 'Cocalzinho de Goiás': 'GO', 'Cristalina': 'GO',
  'Curitiba': 'PR', 'CÉU AZUL': 'PR', 'Flores de Goiás': 'GO', 'Formosa': 'GO', 'Goiânia': 'GO',
  'Irecê': 'BA', 'João Pessoa': 'PB', 'Luziânia': 'GO', 'Mauá': 'SP', 'Navegantes': 'SC',
  'Nova Lima': 'MG', 'Nova Xavantina': 'MT', 'Novo Gama': 'GO', 'Padre Bernardo': 'GO',
  'Palmas': 'TO', 'Planaltina Goiás': 'GO', 'Porto Alegre': 'RS', 'Recife': 'PE',
  'Ribeirão Preto': 'SP', 'Rio de Janeiro': 'RJ', 'Santo Antônio do Descoberto': 'GO',
  "São João D'Aliança": 'GO', 'São Paulo': 'SP', 'União da Vitória': 'PR',
  'Valparaíso de Goiás': 'GO', 'Vitória da Conquista': 'BA', 'Água Fria de Goiás': 'GO',
  'Águas Lindas de Goiás': 'GO',
  // baixa confiança — nomes ambíguos, checar antes de rodar contra produção
  'São Jerônimo': 'RS',
  'Jardim Ingá': 'GO',
  'Riachinho': 'MG',
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function geocodificarEAplicar(regiaoId: string, nome: string, uf: string) {
  const coordenada = await geocodificarRegiao(nome, uf)
  await sleep(1000)
  if (coordenada) {
    await prisma.regiao.update({
      where: { id: regiaoId },
      data: { latitude: coordenada.latitude, longitude: coordenada.longitude },
    })
  } else {
    console.warn(`  ⚠ geocodificação falhou para "${nome}, ${uf}"`)
  }
}

async function upsertRegiao(
  nome: string,
  gabineteId: string,
  uf: string | null,
  regiaoPaiId: string | null
): Promise<string> {
  const existente = await prisma.regiao.findFirst({
    where: { gabineteId, nome: { equals: nome, mode: 'insensitive' }, ativa: true },
  })

  if (existente) {
    const dataFaltando: { uf?: string; regiaoPaiId?: string } = {}
    if (!existente.uf && uf) dataFaltando.uf = uf
    if (!existente.regiaoPaiId && regiaoPaiId) dataFaltando.regiaoPaiId = regiaoPaiId
    if (Object.keys(dataFaltando).length > 0) {
      await prisma.regiao.update({ where: { id: existente.id }, data: dataFaltando })
    }
    if (existente.latitude == null && uf) {
      await geocodificarEAplicar(existente.id, nome, uf)
    }
    return existente.id
  }

  const regiao = await prisma.regiao.create({ data: { nome, uf, gabineteId, ativa: true, regiaoPaiId } })
  if (uf) await geocodificarEAplicar(regiao.id, nome, uf)
  return regiao.id
}

async function main() {
  const gabineteSlug = process.argv[2]
  if (!gabineteSlug) {
    console.error('Uso: npx tsx scripts/importacao-izalci/importar-catalogos-fase2.ts <slug-do-gabinete>')
    process.exit(1)
  }

  const gabinete = await prisma.gabinete.findUnique({ where: { slug: gabineteSlug } })
  if (!gabinete) {
    console.error(`Gabinete com slug "${gabineteSlug}" não encontrado.`)
    process.exit(1)
  }
  console.log(`✓ Gabinete encontrado: ${gabinete.nome} (${gabinete.id})`)

  const jsonPath = path.join(__dirname, 'catalogos-fase2.json')
  const catalogos: Catalogos = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

  let profissoesCriadas = 0
  for (const nome of catalogos.profissoes) {
    const existente = await prisma.profissao.findFirst({
      where: { gabineteId: gabinete.id, nome: { equals: nome, mode: 'insensitive' }, ativa: true },
    })
    if (existente) continue
    await prisma.profissao.create({ data: { nome, gabineteId: gabinete.id, ativa: true } })
    profissoesCriadas++
  }
  console.log(`✓ Profissao: ${profissoesCriadas} criadas (de ${catalogos.profissoes.length} no JSON)`)

  let segmentosCriados = 0
  for (const nome of catalogos.segmentos) {
    const slug = toSlug(nome)
    const existente = await prisma.segmento.findFirst({ where: { gabineteId: gabinete.id, slug, status: 'ativo' } })
    if (existente) continue
    await prisma.segmento.create({
      data: { nome, slug, gabineteId: gabinete.id, tipo: 'geral', status: 'ativo' },
    })
    segmentosCriados++
  }
  console.log(`✓ Segmento: ${segmentosCriados} criados (de ${catalogos.segmentos.length} no JSON)`)

  let areasCriadas = 0
  for (const nome of catalogos.areasColocacao) {
    const existente = await prisma.areaColocacao.findFirst({ where: { gabineteId: gabinete.id, nome } })
    if (existente) continue
    await prisma.areaColocacao.create({ data: { nome, gabineteId: gabinete.id, status: 'ativa' } })
    areasCriadas++
  }
  console.log(`✓ AreaColocacao: ${areasCriadas} criadas (de ${catalogos.areasColocacao.length} no JSON)`)

  const cidadeIdPorNome = new Map<string, string>()
  for (const nome of catalogos.cidades) {
    const uf = UF_POR_CIDADE[nome] ?? null
    const id = await upsertRegiao(nome, gabinete.id, uf, null)
    cidadeIdPorNome.set(nome, id)
  }
  console.log(`✓ Regiao (cidades): ${catalogos.cidades.length} processadas`)

  for (const bairro of catalogos.bairros) {
    const uf = bairro.cidadeMae ? (UF_POR_CIDADE[bairro.cidadeMae] ?? null) : 'DF'
    const regiaoPaiId = bairro.cidadeMae ? cidadeIdPorNome.get(bairro.cidadeMae) ?? null : null
    await upsertRegiao(bairro.nome, gabinete.id, uf, regiaoPaiId)
  }
  console.log(`✓ Regiao (bairros): ${catalogos.bairros.length} processados`)

  console.log('\n✅ Importação de catálogos da Fase 2 concluída.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Checar tipos**

```bash
cd /Users/renato/Documents/meubd
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd /Users/renato/Documents/meubd
git add scripts/importacao-izalci/importar-catalogos-fase2.ts
git commit -m "$(cat <<'EOF'
feat: script de importação dos catálogos da Fase 2 (Izalci)

Lê catalogos-fase2.json e cria Profissao/Segmento/AreaColocacao/Regiao
via Prisma direto, respeitando as mesmas regras de dedup das Server
Actions existentes. Regiao usa upsert (nunca pula um nome já
existente) porque o seed genérico do criarGabinete já cria ~20 desses
mesmos nomes de cidade sem uf/regiaoPaiId/coordenada — o script
completa o que estiver faltando em vez de deixar malformado. Geocodifica
via Nominatim com espaçamento de 1s entre chamadas (a função reaproveitada
não tem rate limit embutido).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rollout — validação em staging, depois produção

**Files:**
- Nenhum arquivo novo — só execução dos scripts das Tasks 1-2 contra bancos reais.

**Interfaces:**
- Consumes: `scripts/importacao-izalci/importar-catalogos-fase2.ts` (Task 2), `scripts/importacao-izalci/catalogos-fase2.json` (Task 1).
- Produces: nada — última task da Fase 2.

- [ ] **Step 1: Descobrir um gabinete de teste existente em staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const { rows } = await client.query('SELECT slug, nome FROM \"Gabinete\" ORDER BY \"criadoEm\"')
  console.log(rows)
  await client.end()
})
"
```

Expected: lista de gabinetes existentes em staging. **Anote o `slug` de um gabinete de teste (não-IZALCI) para o próximo passo** — staging não tem o gabinete IZALCI (só existe em produção), então este passo valida a mecânica do script (roda sem erro, cria as contagens certas, geocodifica) contra um gabinete qualquer, não o dado final do Izalci em si.

- [ ] **Step 2: Rodar o script de importação contra staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
npx tsx scripts/importacao-izalci/importar-catalogos-fase2.ts <slug-anotado-no-step-1>
```

Expected: as 5 linhas `✓ ...` de progresso, terminando em `✅ Importação de catálogos da Fase 2 concluída.`, sem `Error`. O passo de geocodificação leva ~8 minutos (483 regiões nunca vistas, a 1 req/s) — normal demorar.

- [ ] **Step 3: Verificar as contagens em staging**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.staging; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const slug = process.argv[1]
  const { rows: [g] } = await client.query('SELECT id FROM \"Gabinete\" WHERE slug = \$1', [slug])
  const tabelas = ['Profissao', 'Segmento', 'AreaColocacao', 'Regiao']
  for (const t of tabelas) {
    const { rows: [{ count }] } = await client.query(\`SELECT COUNT(*) FROM \"\${t}\" WHERE \"gabineteId\" = \$1\`, [g.id])
    console.log(t, count)
  }
  const { rows: [{ count: comPai }] } = await client.query('SELECT COUNT(*) FROM \"Regiao\" WHERE \"gabineteId\" = \$1 AND \"regiaoPaiId\" IS NOT NULL', [g.id])
  const { rows: [{ count: comCoord }] } = await client.query('SELECT COUNT(*) FROM \"Regiao\" WHERE \"gabineteId\" = \$1 AND latitude IS NOT NULL', [g.id])
  console.log('Regiao com regiaoPaiId:', comPai)
  console.log('Regiao com coordenada:', comCoord)
  await client.end()
})
" -- <slug-anotado-no-step-1>
```

Expected: `Regiao` deve ter pelo menos 75 + 408 = 483 linhas para este gabinete (pode ter mais, se o gabinete de teste já tinha regiões próprias antes). A maioria das `Regiao` deve ter coordenada (algumas falhas de geocodificação são esperadas e não bloqueiam).

- [ ] **Step 4: Rodar o script de importação contra produção (gabinete IZALCI)**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
npx tsx scripts/importacao-izalci/importar-catalogos-fase2.ts izalci
```

Expected: mesmas 5 linhas `✓ ...`, terminando em `✅ Importação de catálogos da Fase 2 concluída.`, sem `Error`. Se `izalci` não for o slug real do gabinete (o usuário criou manualmente e o slug pode ter saído diferente de `toSlug('IZALCI')`), o script imprime `Gabinete com slug "izalci" não encontrado.` — nesse caso, rodar antes: `set -a; source .env.local; set +a && node -e "import('pg').then(async({Client})=>{const c=new Client({connectionString:process.env.DIRECT_URL});await c.connect();const{rows}=await c.query('SELECT slug,nome FROM \"Gabinete\" ORDER BY \"criadoEm\" DESC LIMIT 5');console.log(rows);await c.end()})"` pra achar o slug certo.

- [ ] **Step 5: Verificar as contagens em produção**

```bash
cd /Users/renato/Documents/meubd
set -a; source .env.local; set +a
node -e "
import('pg').then(async ({Client}) => {
  const client = new Client({connectionString: process.env.DIRECT_URL})
  await client.connect()
  const slug = process.argv[1]
  const { rows: [g] } = await client.query('SELECT id FROM \"Gabinete\" WHERE slug = \$1', [slug])
  const tabelas = ['Profissao', 'Segmento', 'AreaColocacao', 'Regiao']
  for (const t of tabelas) {
    const { rows: [{ count }] } = await client.query(\`SELECT COUNT(*) FROM \"\${t}\" WHERE \"gabineteId\" = \$1\`, [g.id])
    console.log(t, count)
  }
  const { rows: [{ count: comPai }] } = await client.query('SELECT COUNT(*) FROM \"Regiao\" WHERE \"gabineteId\" = \$1 AND \"regiaoPaiId\" IS NOT NULL', [g.id])
  const { rows: [{ count: semCoord }] } = await client.query('SELECT nome FROM \"Regiao\" WHERE \"gabineteId\" = \$1 AND latitude IS NULL', [g.id])
  console.log('Regiao com regiaoPaiId:', comPai)
  console.log('Regiao sem coordenada:', semCoord)
  await client.end()
})
" -- izalci
```

Expected: `Profissao` = 232 (ou mais, se o gabinete já tinha alguma da seed genérica que não bateu nome), `Segmento` = 203, `AreaColocacao` = 100 (mais os defaults do seed genérico não coincidentes), `Regiao` >= 483, `Regiao com regiaoPaiId` >= 283. `Regiao sem coordenada` deve listar principalmente `Entorno do DF` (esperado, não é um município real) e talvez alguns poucos casos de falha pontual do Nominatim — nada em massa.

- [ ] **Step 6: Reportar ao usuário**

Sem commit adicional (Task 3 só executa scripts já commitados nas Tasks 1-2). Confirmar ao usuário: contagens finais em produção, quantas `Regiao` ficaram sem coordenada e quais, e lembrar que o gabinete IZALCI agora tem os 4 catálogos populados — pronto para a Fase 3 (importação de `Pessoa`).
