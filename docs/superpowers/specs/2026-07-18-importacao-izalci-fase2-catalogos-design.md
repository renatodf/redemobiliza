# Importação Izalci — Fase 2: Catálogos — Spec

## Contexto

Segunda das 5 fases descritas em `docs/superpowers/specs/2026-07-18-importacao-izalci-mongodb-design.md` (spec-mãe da importação da base MongoDB do senador Izalci Lucas). A Fase 1 (fundação de schema — `regiaoPaiId`, `zonaEleitoral`/`secaoEleitoral`, `TelefoneExtra`) já está implementada e mergeada em `main`. O gabinete **IZALCI** já foi criado em produção pelo usuário (ação manual, fora de código).

Esta fase constrói os catálogos (`Regiao`, `Profissao`, `Segmento`, `AreaColocacao`) a partir das tags do Mongo, para o gabinete IZALCI. **Nenhuma `Pessoa` é importada nesta fase** — isso é Fase 3.

## Objetivo

Popular os 4 catálogos do gabinete IZALCI com os valores reais extraídos das tags do Mongo (coleção `tags`, tenant Izalci `_id: 60b7934c0cc64a0004717e9d`), aplicando as fusões e decisões de hierarquia já confirmadas nesta sessão, sem perder nenhum valor real por falta de correspondência prévia (princípio de completude já registrado no spec-mãe).

## Escopo — o que entra

| Tag Mongo (`type`) | Destino Rede Mobiliza | Quantidade (tenant Izalci) |
|---|---|---|
| `Profession` | `Profissao` | 232 tags → 232 registros (sem duplicata encontrada) |
| `Segment` | `Segmento` | 207 tags → 202 registros (5 fusões, ver abaixo) |
| `EmploymentRole` | `AreaColocacao` | 100 tags → 100 registros (sem duplicata encontrada) |
| `City` | `Regiao` (nível cidade, `regiaoPaiId = null`) | 77 tags → 75 registros (2 fusões, ver abaixo) |
| `Neighborhood` | `Regiao` (nível bairro, `regiaoPaiId` = id da cidade resolvida) | 409 tags → 408 registros (1 fusão, ver abaixo; 283 com `regiaoPaiId` preenchido, 125 soltos) |

Checagem de duplicata normalizada (maiúsculas/acentuação/pontuação removidas) rodada em `Profession` e `EmploymentRole` nesta sessão — nenhuma encontrada. Não houve busca de duplicata semântica (tipo os pares de Segmento) nessas duas categorias; se aparecer uma depois, corrige-se pela ferramenta de merge do sprint futuro (ver spec-mãe).

## Segmento — fusões confirmadas

Já documentadas no spec-mãe (seção "Segmentos (deduplicação e casos especiais)"), reproduzidas aqui por completude:

- `ABEDUQ` + `ABEDUQ - CHEQUE-EDUCAÇÃO` → um só registro.
- `BOLSA UNIVERSITÁRIA` + `B. UNIVERSITARIA` → um só registro.
- `CRC-DF` + `CRC-DF - CONSELHO REGIONAL DE CONTABILIDADE` → um só registro.
- `DF DIGITAL` + `TELECENTROS - DF DIGITAL` → um só registro.
- `Acao social` + `Ação social .` → `Ação social` (achado durante a execução real da Task 3, não detectado na checagem de duplicata original — a diferença de acentuação/pontuação escapou da revisão manual de 18/07; ver `docs/superpowers/plans/2026-07-18-importacao-izalci-fase2-catalogos.md`, commit `62d55b0`).
- `BANCO ANTIGO` (66.511 pessoas, tenant inteiro) entra normal — representa um sistema de campanha anterior a este, não é ruído técnico.
- Nome canônico final de cada par fundido (qual dos dois textos vira `Segmento.nome`): decidir na implementação, sem impacto funcional na escolha.

## Região — hierarquia cidade → bairro

### Cidades (nível-mãe, `regiaoPaiId = null`)

77 tags `City` → 75 `Regiao`. Duas fusões confirmadas (ver spec-mãe):
- `Sol Nascente - Pôr do Sol` + `Sol Nascente/Pôr do Sol` → mesma cidade.
- `Guará` + `Guará / Lúcio Costa` → cidade vira só `Guará` (o bairro `LUCIO COSTA`, que já existe como tag `Neighborhood` própria, continua intacto e vinculado a `Guará`).

Todas as 77 cidades entram, incluindo as 41 que não são do DF (municípios do Entorno em Goiás e contatos raros de outros estados) — não são removidas nem fundidas, ficam como `Regiao` normal. `uf` é preenchido a partir do estado real de cada cidade (a maioria DF, resto GO e alguns outros — resolver na implementação a partir do nome/contexto de cada tag, já que a tag `City` do Mongo não carrega UF própria).

### Bairros (nível-filho, `regiaoPaiId` = id da cidade resolvida)

409 tags `Neighborhood` → 408 `Regiao`. Uma fusão adicional encontrada durante a checagem de duplicatas normalizadas (mesma classe de sujeira que o par `Sol Nascente` de cidade — só diferença de acentuação, achado nesta revisão, não tinha sido confirmada com o usuário antes desta spec):
- `Valparaíso de Goias` + `Valparaíso de Goiás` → mesmo bairro.

As 408 `Regiao` de bairro resultantes ganham `regiaoPaiId` resolvido por um pipeline de 3 níveis de confiança, aplicados nesta ordem (o primeiro que resolver, vale):

1. **Sufixo entre parênteses** (ex.: `"Taguatinga Norte (Taguatinga)"`): extrai o texto entre parênteses e verifica se contém (substring, não precisa ser igual) o nome normalizado de alguma cidade já resolvida. Resolve 134 bairros.
2. **Nome do bairro contém nome de cidade conhecida** (sem parênteses, ex.: `"Cruzeiro Novo"` contém `"Cruzeiro"`; inclui o par fundido `Valparaíso de Goias`/`Valparaíso de Goiás`, cujo nome normalizado bate exatamente com a cidade `Valparaíso de Goiás`): normaliza (maiúsculas, sem acento/pontuação) e verifica substring/prefixo do nome da cidade dentro do nome do bairro. Resolve mais 69 bairros (após a fusão da dupla Valparaíso).
3. **Co-ocorrência de tag `City` na mesma pessoa, excluindo `Brasília`**: para os bairros ainda não resolvidos, cruza com `people.tag_ids` — conta quais tags `City` aparecem nas mesmas pessoas que têm aquele bairro, **ignorando a tag `Brasília`** (usada como cidade genérica/coringa por grande parte da base, o que distorce esse sinal se não for excluída). Se uma cidade não-Brasília aparecer em ≥50% das pessoas do bairro **e** em pelo menos 3 pessoas, usa essa cidade. Resolve mais 80 bairros.

Total resolvido: 134 + 69 + 80 = **283 bairros com `regiaoPaiId`**. Os **125 bairros restantes** (não resolvidos por nenhum dos 3 níveis) entram como `Regiao` solta, `regiaoPaiId = null` — sem perda de dado, só sem hierarquia por enquanto. Fica para a ferramenta de merge/organização de catálogo do sprint futuro (já anotada no spec-mãe) resolver esses casos com curadoria humana.

**Achado durante a execução real da Task 3, não previsto nesta spec original**: 30 dos 408 bairros têm `nome` igual (ignorando caixa/acento) ao próprio `cidadeMae` resolvido — o bairro central que dá nome à Região Administrativa (ex. bairro "Sobradinho" dentro da cidade "Sobradinho", bairro "LAGO SUL" dentro de "Lago Sul", bairro "LUZIANIA" dentro de "Luziânia"). São a mesma entidade física que a cidade já criada — o script de importação (Task 2) pula essas 30 entradas por completo em vez de criar uma segunda `Regiao` redundante ou (como aconteceu antes do fix) uma auto-referência de `regiaoPaiId`. Ver `docs/superpowers/plans/2026-07-18-importacao-izalci-fase2-catalogos.md`, commits `692355b`/`fe3c346`/`4952d40`, para o histórico completo da correção.

`uf` do bairro: mesma UF da cidade-mãe quando resolvida; quando solto, decidir na implementação (provavelmente `DF` como default, dado que a esmagadora maioria dos bairros sem cidade-mãe resolvida ainda são do DF — confirmar durante a implementação).

### Geocodificação

Todas as 483 `Regiao` novas (75 cidades + 283 bairros com pai + 125 bairros soltos — os soltos também são geocodificados individualmente pelo próprio nome) ganham `latitude`/`longitude` via Nominatim durante a Fase 2, reaproveitando o mesmo padrão de chamada já usado em `src/lib/geocodificar-regiao.ts` (1 requisição/segundo, `User-Agent` identificado). A 483 requisições, isso leva uns 8 minutos. Falha de geocodificação de uma região específica não bloqueia as demais (mesmo padrão de tratamento de erro do `criarRegiao` atual — loga e segue sem coordenada).

## Arquitetura do ETL

Dois scripts, dois estágios, com um artefato intermediário revisável entre eles:

1. **Extração (Python)** — `scripts/importacao-izalci/extrair_catalogos.py`: decodifica `tags.bson.gz` do backup físico (`/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/`), filtra pelo tenant Izalci, aplica as fusões de Segmento e Região, resolve a hierarquia de bairros pelo pipeline de 3 níveis acima (cruzando com `people.bson.gz` só para o passo 3 de co-ocorrência), e escreve um único JSON de saída: `scripts/importacao-izalci/catalogos-fase2.json`. Esse arquivo **é committado no repositório** — contém só nomes de lugares/segmentos/profissões/cargos (nenhum dado pessoal), serve de artefato de revisão humana antes de qualquer escrita real no banco.
2. **Revisão**: usuário confere o JSON gerado (lista final de 75 cidades, 408 bairros com/sem pai, 202 segmentos, 232 profissões, 100 cargos) antes do próximo passo.
3. **Importação (TypeScript)** — `scripts/importacao-izalci/importar-catalogos-fase2.ts` (rodado via `npx tsx`, mesmo padrão de `scripts/vincular-mobilizador.ts`): lê `catalogos-fase2.json`, conecta no gabinete IZALCI (via slug ou id, a definir na implementação) e cria os registros via Prisma Client direto (não via Server Action, que exige sessão HTTP) — `Profissao`, `Segmento`, `AreaColocacao` primeiro (sem dependência entre si), depois `Regiao` em duas ondas (cidades primeiro, depois bairros, já que bairros referenciam `regiaoPaiId` de uma cidade que precisa existir antes), com a chamada de geocodificação por região criada. Roda primeiro contra staging (`.env.staging`), verificado, depois produção (`.env.local`), mesmo padrão de rollout usado na Fase 1.

## Testes

Sem testes automatizados de integração com Mongo/Postgres real (mesmo padrão já estabelecido no projeto — só função pura ganha teste Vitest, e este projeto não tem suíte de teste Python). A validação é manual: conferir o JSON gerado contra os números deste spec (75 cidades, 283 bairros com pai, 125 soltos, 202 segmentos, 232 profissões, 100 cargos) antes de importar.

## Fora de escopo (confirmado)

- Importação de `Pessoa`, `phones`, `curriculums`, `VinculoRede` — fases 3, 4 e 5.
- Ferramenta de admin para mesclar regiões/catálogos manualmente — sprint futuro, fora deste projeto.
- Filtro "Somente DF / DF + região específica / Somente fora do DF" na Central de Filtros — sprint futuro, anotado no spec-mãe.
- Qualquer UI nova — a Fase 2 só popula dados de catálogo que já têm UI de gestão (Configurações → Cidades/Profissões/Segmentos/Áreas de Colocação).
