# Importação Izalci — Fase 5: Rede de Indicação — Spec

## Contexto

Quinta e última das 5 fases descritas em `docs/superpowers/specs/2026-07-18-importacao-izalci-mongodb-design.md` (spec-mãe da importação da base MongoDB do senador Izalci Lucas). Fases 1 (schema), 2 (catálogos), 3 (pessoas) e 4 (Banco de Talentos) já implementadas, mergeadas e rodadas em staging e produção — 122.725 `Pessoa` reais e 526 `BancoTalentos` reais já estão no gabinete IZALCI.

Esta fase reconstrói a rede de indicação (`VinculoRede`) a partir de `people.created_by_id`, ligando cada `Pessoa` já importada ao seu indicador (outra `Pessoa`), ou marcando-a como raiz da rede do gabinete quando não há indicador utilizável.

## O problema central: religar `created_by_id` a uma `Pessoa` do Postgres

A Fase 3 não preservou nenhum id do Mongo em `Pessoa`. Além disso, quando duas pessoas do Mongo compartilhavam o mesmo `whatsapp`, a Fase 3 importou só a primeira (por ordem de iteração de `people.bson.gz`), via `registrarWhatsappUnico` — a segunda foi pulada. Isso significa que, pra saber o `created_by_id` certo de cada `Pessoa` já importada, é preciso saber **qual documento Mongo específico "ganhou" a criação daquela `Pessoa`**.

A solução é refazer exatamente o mesmo passo de seleção que a Fase 3 fez: reprocessar `people.bson.gz` na mesma ordem, com os mesmos filtros (tenant Izalci, exclusão de dummy do Luar via `ehPessoaDummyDoLuar`, cálculo de `whatsapp` via `escolherTelefones` — todas reaproveitadas de `lib-pessoas-fase3.ts`, sem reescrever). Isso reconstrói, de forma determinística, um mapa `whatsapp → mongoId canônico` idêntico ao que a Fase 3 usou implicitamente, e portanto o `created_by_id` correto de cada `Pessoa`.

## Algoritmo de resolução

1. Reprocessar `people.bson.gz` (mesma ordem, mesmos filtros da Fase 3) construindo:
   - `whatsapp → mongoId canônico` (o documento que "ganhou" aquele whatsapp)
   - `mongoId canônico → created_by_id` (do próprio documento)
2. Carregar do Postgres um mapa `whatsapp → pessoaId` (uma query, `Pessoa` do gabinete IZALCI, ~122.725 linhas).
3. Para cada `Pessoa` já importada (identificada pelo seu `mongoId` canônico via passo 1):
   - Se `created_by_id` for um dos 2 IDs de desenvolvedor do sistema antigo (`67605433e30de14b89780451` Gustavo Vieira Silva, `6063a6ccc3e599000464eaa7` Luar Faria) → **raiz** (`indicadoPorId = null`).
   - Senão, se `created_by_id` também for um `mongoId` canônico (ou seja, o indicador também virou `Pessoa`) → resolve `indicadoPorId` via o mapa `whatsapp → pessoaId` do passo 2.
   - Senão (indicador não foi importado — sem telefone válido, excluído como dummy do Luar, ou (achado adicional da investigação) referencia um `_id` que existe no Mongo mas fora do tenant Izalci — 5 casos; confirmado ≈791 de 112.407 casos, <1%) → **raiz** (`indicadoPorId = null`), mesma regra dos 2 devs.
   - Se `created_by_id` não estiver preenchido no Mongo (30.082 pessoas, ~21%) → **raiz**.
4. `nivel`: calculado pela profundidade real da cadeia **já resolvida no Postgres** — raiz tem `nivel = 0`, filho tem `nivel` do indicador + 1. Processar as pessoas em ordem crescente de profundidade original no Mongo (calculada e validada na investigação: sem ciclos, profundidade máxima 8) garante que todo indicador já foi processado antes do seu indicado.
5. Idempotência: antes de criar, carregar do Postgres quais `pessoaId` já têm `VinculoRede` ativa (`deletedAt IS NULL`) e pular — permite reexecutar o script com segurança.
6. Criar as ~122.725 linhas de `VinculoRede` em lotes via `createManyAndReturn` (mesmo padrão de volume da Fase 3).

## Dados confirmados na investigação

Investigação direta no backup (`people.bson.gz`, filtrado por `tenant_id` = Izalci):
- 142.489 pessoas do tenant Izalci (confirma o número já usado nas Fases 1-4).
- 112.407 com `created_by_id` preenchido (78,9%, confirma o número do spec-mãe).
- 95.158 (84,7% dos com `created_by_id`) apontam direto pra um dos 2 devs.
- **Zero ciclos** na cadeia `created_by_id`.
- Profundidade máxima da cadeia: 8.
- 5 casos onde `created_by_id` aponta pra um `_id` que existe no Mongo mas **fora do tenant Izalci** (dado inconsistente do sistema legado) — tratado como indicador não-importado (vira raiz, mesma regra abaixo).
- ≈786 de 112.407 (<1%) têm `created_by_id` apontando pra alguém sem telefone válido (proxy: nenhum telefone com ≥10 dígitos) — candidatos a virar raiz por indicador não-importado. Somado aos 5 casos cross-tenant, ≈791 casos (<1%) de indicador não-importado no total.

## Por que `nivel` usa a profundidade "realizada" (pós-Postgres), não a bruta do Mongo

Confirmado por investigação de código (`src/actions/public/submeter-cadastro.ts`, `src/app/super-admin/page.tsx`, `src/lib/rede.ts`) que:
- Toda `Pessoa` criada hoje pelo fluxo de cadastro público ganha exatamente uma `VinculoRede`, inclusive raízes (`indicadoPorId = null`).
- O campo `nivel` **não é usado por nenhuma lógica de negócio real** do app hoje — o único lugar que o lê (`super-admin/page.tsx`, filtro `nivel: 0` como "mobilizadores raiz") já está inconsistente com o valor que o próprio app grava (`nivel: mobilizadorId ? 2 : 1`, nunca 0). Toda navegação de árvore usa `indicadoPorId`, não `nivel`.
- Dado isso, `nivel` é essencialmente informativo/analítico nesta importação — calcular pela profundidade realizada no grafo pós-import (em vez da profundidade bruta do Mongo) é mais simples e fica idêntico à profundidade bruta em >99% dos casos (só diverge nos <1% de indicador não-importado, onde a cadeia é cortada mais cedo).

## Arquitetura

Um único script TypeScript (`scripts/importacao-izalci/importar-rede-fase5.ts`), sem estágio Python:
- Reaproveita `escolherTelefones`, `normalizarNome`, `ehPessoaDummyDoLuar`, tipo `TelefoneMongo` de `lib-pessoas-fase3.ts` (não reescrever).
- Decodifica `people.bson.gz` e `phones.bson.gz` diretamente (mesma técnica de iteração manual já usada nas Fases 3-4, dado que `tsconfig.json` não tem `downlevelIteration`).
- Função pura pra cálculo de `nivel` (dado um grafo de `indicadoPorId` já resolvido, calcula profundidade sem recursão ilimitada — usar processamento iterativo em ordem topológica, não recursão ingênua, já que o volume é ~122 mil nós) — testável com Vitest.
- Cria os registros em lotes via `createManyAndReturn` (mesmo padrão da Fase 3, dado o volume).
- Relatório de pessoas que viraram raiz por "indicador não-importado" (distinto de raiz por falta de `created_by_id` ou por apontar pra um dev) impresso no terminal e salvo fora do repositório (`os.tmpdir()`), mesmo padrão das fases anteriores — sem dado pessoal no relatório além do necessário pra depuração (nomes ficam de fora; usar só ids/telefones parciais se necessário).

### Rollout em 2 estágios (mesmo padrão da Fase 4)

1. **Staging completo** — valida a mecânica e a resolução de indicador contra as `Pessoa`s que a Fase 3 já importou lá.
2. **Produção** — só depois do staging confirmado limpo.

## Testes

Sem testes automatizados de integração com Mongo/Postgres real (padrão já estabelecido). A função de cálculo de `nivel` a partir de um grafo já resolvido é pura e ganha teste Vitest de verdade (TDD), incluindo casos de: raiz simples, cadeia de profundidade N, múltiplas raízes independentes. Validação por contagem exata e amostragem em cada estágio do rollout.

## Fora de escopo (confirmado)

- Qualquer UI nova — a árvore de rede já existe (`/[slug]/admin/pessoas`, `/[slug]/mobilizador/rede`) e lê `VinculoRede` normalmente, sem mudança de código de aplicação necessária.
- `network_id`/coleção `user_networks` — confirmado no spec-mãe, não usados como fonte.
- Reprocessar ou alterar `nivel`/`indicadoPorId` de `VinculoRede` já existentes fora desta importação (não deve haver nenhuma, já que IZALCI é um gabinete novo sem cadastro público ativo ainda).
