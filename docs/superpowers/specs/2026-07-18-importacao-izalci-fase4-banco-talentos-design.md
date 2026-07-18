# Importação Izalci — Fase 4: Banco de Talentos — Spec

## Contexto

Quarta das 5 fases descritas em `docs/superpowers/specs/2026-07-18-importacao-izalci-mongodb-design.md` (spec-mãe da importação da base MongoDB do senador Izalci Lucas). Fases 1 (schema), 2 (catálogos) e 3 (pessoas) já implementadas, mergeadas e rodadas em staging e produção — 122.725 `Pessoa` reais já estão no gabinete IZALCI.

Esta fase importa a coleção `curriculums` (548 registros, confirmado que todos pertencem ao tenant Izalci via `person_id`) pro modelo `BancoTalentos` + `BancoTalentosArea`, vinculando a `Pessoa`s já importadas na Fase 3 e a `AreaColocacao`s já criadas na Fase 2. **Nenhuma rede de indicação (`VinculoRede`) é criada nesta fase** — isso é Fase 5.

## O problema central: religar `curriculums.person_id` a uma `Pessoa` do Postgres

A Fase 3 não preservou nenhum id do Mongo nos registros criados — `Pessoa` não tem campo pra isso. Para achar a `Pessoa` correta de um currículo, esta fase recalcula o `whatsapp` da pessoa dona (reaproveitando `escolherTelefones` de `scripts/importacao-izalci/lib-pessoas-fase3.ts`, a mesma função e a mesma lógica já usada e validada em produção pela Fase 3) e busca no Postgres uma `Pessoa` do gabinete com esse `whatsapp`.

Investigação direta no backup confirmou: dos 548 `person_id` referenciados por `curriculums`, todos os 548 existem em `people` e pertencem ao tenant Izalci; **543 teriam `whatsapp` válido** pela mesma regra da Fase 3 (os outros 5 não têm telefone válido, logo não foram importados como `Pessoa`). Esses ~5 currículos ficam de fora desta rodada — listados num relatório de execução fora do repositório (mesmo padrão das fases anteriores), não descartados.

## Mapeamento de campos: `curriculums` → `BancoTalentos`/`BancoTalentosArea`

Já definido e confirmado no spec-mãe (seção "Banco de Talentos"):

| Mongo `curriculums` | Rede Mobiliza | Regra |
|---|---|---|
| `person_id` | `BancoTalentos.pessoaId` | Resolvido via WhatsApp recalculado (ver acima); currículo sem `Pessoa` correspondente fica de fora, listado |
| `priority` | `prioridade` | Direto (mesmo default: 3) |
| `has_disability` | `isPcd` | Direto |
| `found_job` | `colocado` | Direto |
| `employment_role_ids` (lista de `ObjectId`) | `BancoTalentosArea` (relação com `AreaColocacao`) | Resolve cada id via tag `type: "EmploymentRole"` (mesma decodificação de tag já usada nas Fases 2-3), casa por nome com o catálogo `AreaColocacao` já criado na Fase 2 |
| `who_indicate` + `observation` | `observacao` | Concatenar os dois quando ambos preenchidos (com separador claro, ex. `"; "`); se só um estiver preenchido, usar só ele; se nenhum, `null` |
| `curriculum_file_data` | **Não trazer** | Arquivo real não recuperável (mesmo problema de `photo_data` da Fase 3 — metadado de cache, sem o binário) |

`BancoTalentos.pessoaId` é único no schema (relação 1:1 com `Pessoa`) — não há risco de duas linhas de `BancoTalentos` pra mesma pessoa, já que cada `curriculums._id` tem exatamente um `person_id` e o Mongo não tem currículos duplicados por pessoa (548 currículos, 548 `person_id` únicos, confirmado na investigação).

## Arquitetura

Um único script TypeScript (`scripts/importacao-izalci/importar-banco-talentos-fase4.ts`), sem estágio Python nem JSON intermediário — `who_indicate`/`observation` são texto livre que pode conter dado pessoal, mesma regra da Fase 3: nada disso vai pro git, nem como rascunho.

- Decodifica `curriculums.bson.gz` e `tags.bson.gz` diretamente (mesma técnica de leitura BSON já usada na Fase 3 — reaproveitar/duplicar o helper de iteração, sem introduzir um módulo compartilhado novo entre scripts, mesmo padrão de scripts pontuais independentes já estabelecido).
- Resolve `AreaColocacao` por nome consultando o catálogo já criado no Postgres pela Fase 2 (mesmo padrão de `carregarCatalogoProfissao`/`carregarCatalogoRegiao` da Fase 3).
- Resolve `pessoaId` recalculando o `whatsapp` de cada `person_id` referenciado (usando `escolherTelefones` importada de `lib-pessoas-fase3.ts` da Fase 3 — não reimplementar) e buscando no Postgres.
- **Dado o volume pequeno (548 registros)**, cria os registros um a um via `prisma.bancoTalentos.create` (não precisa da inserção em lote via `createManyAndReturn` que a Fase 3 usou pra 142 mil registros) — mais simples e suficientemente rápido pra essa escala.
- Relatório de currículos não vinculados (sem `Pessoa` correspondente) impresso no terminal e salvo fora do repositório (`os.tmpdir()`, mesmo padrão da Fase 3).

### Rollout em 2 estágios (mais simples que a Fase 3 — volume não justifica um lote pequeno de teste separado)

1. **Staging completo** (gabinete de teste já usado nas Fases 2-3) — valida a mecânica e a religação por WhatsApp contra as `Pessoa`s que a Fase 3 já importou lá.
2. **Produção** (gabinete IZALCI) — só depois do staging confirmado limpo.

## Testes

Sem testes automatizados de integração com Mongo/Postgres real (padrão já estabelecido). A lógica de concatenação de `observacao` (dois campos opcionais, com separador) é pura e pequena o suficiente pra não justificar uma função isolada com teste próprio — mas se a implementação achar valor em extraí-la (mesmo padrão de `lib-pessoas-fase3.ts`), pode reaproveitar esse arquivo em vez de criar um novo. Validação por contagem exata e amostragem em cada estágio do rollout.

## Fora de escopo (confirmado)

- `VinculoRede` (rede de indicação) — Fase 5.
- Arquivo real do currículo (`curriculum_file_data`) — não recuperável, não entra.
- Qualquer UI nova — a Fase 4 só popula dados que já têm UI de gestão (Central de Filtros → aba Banco de Talentos).

## Nota pós-execução

Executado com sucesso contra staging e produção, resultado idêntico nos dois ambientes: `BancoTalentos` = 526 (de 548 currículos candidatos), 22 não vinculados (5 sem whatsapp calculável, 6 sem `Pessoa` ativa correspondente, 11 barrados pela própria checagem de idempotência), com ≥1 `AreaColocacao` = 514, `isPcd = true` = 4, `colocado = true` = 2. Diferente das Fases 2 e 3, nenhum bug real foi encontrado na execução ao vivo — as classes de bug já vistas nas fases anteriores foram tratadas preventivamente no design e a prevenção se confirmou na prática. Detalhes completos: `docs/superpowers/plans/2026-07-18-importacao-izalci-fase4-banco-talentos.md`.
