# Importação da base MongoDB do Izalci para o Rede Mobiliza — Spec

## Objetivo

Trazer os dados reais do sistema antigo do senador Izalci Lucas (hoje em MongoDB Atlas) para um **gabinete novo** no Rede Mobiliza, chamado **IZALCI**. O gabinete existente usado ao longo desta sessão continua só para testes — não recebe esses dados.

## Origem dos dados

- **Cluster MongoDB Atlas**: `production.wj3pr.mongodb.net` (projeto Atlas do usuário)
- **Credenciais**: usuário de banco `meubancodedados`, senha guardada apenas localmente pelo usuário (não reproduzida aqui — ver regra de nunca colocar segredo real em documento, `feedback_no_real_secrets_in_docs` na memória do projeto)
- **Banco relevante**: `meubancodedadosprod` (17GB brutos no Atlas; o backup comprimido excluindo lixo temporário ficou em ~20MB)
- **Tenant do Izalci**: `_id` (ObjectId) `60b7934c0cc64a0004717e9d`, `name: "Izalci"`, `candidate_name: "Izalci Lucas"`, `political_party: "PL"`, `state: "DF"`. **Importante**: o campo `tenant_id` em `people` é do tipo `ObjectId`, não string — comparações precisam de `new ObjectId(...)`, não string crua (armadilha já encontrada 2x durante a investigação).
- **Outro tenant no mesmo banco** (ignorar): `68482b879cac58651608247c`, "Gustavo Aires" (MDB, DF) — só 424 pessoas, não faz parte deste projeto.
- **Backup físico já realizado**: `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/` — dump completo via `mongodump --gzip`, excluindo só `temp.chunks`/`temp.files` (lixo de upload temporário órfão, coleções de armazenamento permanente `fs.chunks`/`fs.files` estão vazias). 35 coleções, verificado íntegro via `bsondump` (decodificação de `tenants.bson.gz` bateu exatamente com os dados ao vivo). Restaurável com `mongorestore` em qualquer MongoDB, inclusive local.
- Ferramentas MongoDB (`mongodump`/`mongorestore`/`bsondump`/driver Node `mongodb`) foram baixadas/instaladas no diretório de scratchpad da sessão, não fazem parte do projeto Rede Mobiliza.

## Destino

- Gabinete novo: **IZALCI** — **criado em produção em 18/07** pelo usuário via tela de super-admin (ação manual, fora do escopo de código da Fase 1).
- Catálogos padrão (Regiao/Profissao/AreaDemanda/AreaColocacao) que o `criarGabinete` semeia por padrão **serão substituídos/complementados** pelos catálogos reais construídos a partir dos dados do Mongo (Fase 2) — não usar os genéricos.

## Princípio geral: completude de catálogos

Decisão do usuário (18/07, sessão de acompanhamento): **toda informação de catálogo que existir no banco antigo (Mongo) e não tiver correspondência no Rede Mobiliza é criada durante a importação** — nada é descartado por falta de correspondência prévia. Vale para `Regiao` (cidade e bairro), `Segmento`, `Profissao`, `AreaColocacao` (cargos almejados do Banco de Talentos, via tag `EmploymentRole`) e os telefones extras (`TelefoneExtra`). A única forma de dois valores do Mongo virarem **um só** registro no Rede Mobiliza é uma fusão **explicitamente confirmada** pelo usuário (ver as fusões de Região e Segmento documentadas abaixo) — fora essas fusões nomeadas, cada valor distinto do Mongo vira seu próprio registro, mesmo que pareça redundante ou de baixo valor à primeira vista (ex.: `BANCO ANTIGO`, ver seção de Segmentos).

## Escopo — o que entra

| Dado Mongo | Destino Rede Mobiliza | Observação |
|---|---|---|
| `people` (142.489 registros, tenant Izalci) | `Pessoa` | Ver mapeamento de campos abaixo |
| `phones` (215.225, via `person_id`) | `whatsapp` (principal) + nova estrutura de telefone extra | Ver estratégia de telefone abaixo |
| `curriculums` (548, todos do tenant Izalci via `person_id`) | `BancoTalentos` + `BancoTalentosArea` | Mapeamento quase 1:1, ver seção própria |
| `tags` tipo `City`/`Neighborhood` | `Regiao` (hierarquia cidade→bairro) | Ver seção de hierarquia |
| `tags` tipo `Profession` | `Profissao` | |
| `tags` tipo `Segment` | `Segmento` | |
| `tags` tipo `EmploymentRole` (só usado via `curriculums.employment_role_ids`, não via `people.tag_ids`) | `AreaColocacao` | |
| `tags` tipo `Gender` | `Pessoa.genero` | Só 2 valores no banco inteiro, ver decodificação abaixo |
| `tags` tipo `Religion` | `Pessoa.religiao` | Só 1 valor usado de verdade ("CATÓLICA APOSTÓLICA ROMANA") — baixo valor mas sem custo trazer |
| `tags` tipo `Schooling` | `Pessoa.escolaridade` | |
| `people.created_by_id` | `VinculoRede.indicadoPorId` | Com exclusões, ver seção de rede de indicação |
| `people.deleted` | `Pessoa.deletedAt` | `true` → soft-deletado; `false`/ausente → ativo |
| `people.coordinates` (58,3% preenchido) | reaproveitar direto, sem geocodificar de novo | |

## Escopo — o que NÃO entra (decisão do usuário)

- **Fotos** (`people.photo_data`, `curriculums.curriculum_file_data`) — são só metadados de arquivo (padrão Carrierwave/cache), os arquivos reais não estão no backup (`fs.files`/`fs.chunks` vazios) e provavelmente não são recuperáveis. Usuário confirmou: base pode ir sem foto.
- **Demandas / módulo de Atendimentos** (`requests`, 993 registros) — descartar por completo.
- **Observações** (`person_observations` 59.266, `event_observations` 23) — descartar por completo.
- Tags tipo `Attendance`, `DocumentType`, `Task` — 0 pessoas usam essas tags (confirmado por query), consistente com descartar o módulo de Atendimentos/Demandas.
- Tags tipo `Bond` (relação com quem cadastrou — "amigo", "família", etc., 6.422 pessoas) — sem equivalente no Rede Mobiliza hoje, baixa prioridade, não entra nesta rodada.
- `network_id` / coleção `user_networks` — investigado e descartado como fonte de rede de indicação (ver seção própria); é um agrupamento mais grosso ("a qual sistema/rede a pessoa pertence"), não a relação fina pessoa-a-pessoa que o `VinculoRede` representa.
- `calendars`, `calendar_events`, `surveys`, `survey_answers`, `sms_configs`, `notifications`, `campaigns`, `message_configs`, `message_records`, `email_configs` — módulos sem equivalente no Rede Mobiliza (agenda, pesquisa, SMS, campanha), fora de escopo.
- `temp.chunks`/`temp.files` do Mongo — já excluídos do próprio backup físico.

## Decodificação de campos com valor de referência (não há tabela de lookup no Mongo)

Nenhuma coleção "genders"/"religions"/"cities" existe no cluster — `gender_id`/`religion_id` são `ObjectId` que só fazem sentido cruzando com a coleção `tags` (que tem um campo `type` próprio, resolvendo a classificação) ou, no caso do gênero, confirmado por amostra de nomes:

- `gender_id = 5c82c37a24a225000460301f` → **Feminino** (confirmado por tag `{type: "Gender", label: "FEMININO"}` E por amostra de 20 nomes, ex: Cicera, Ana Maria, Marcela, Isabela)
- `gender_id = 5c82c37a24a2250004603016` → **Masculino** (confirmado por tag `{type: "Gender", label: "MASCULINO"}` E por amostra de 20 nomes, ex: Francisco, Bruno, Gabriel, Lucas)
- `religion_id = 5c82c2c724a2250004602f24` → **CATÓLICA APOSTÓLICA ROMANA** (único valor usado em todo o banco)

## Campos "confusos" — pares legado vs. atual (usar sempre o atual/mais preenchido)

| Conceito | Campo legado (quase vazio, ignorar) | Campo atual (usar) |
|---|---|---|
| Data de nascimento | `datanascimento`/`datanascimentoformatada` (0,4%) | `birth_date` (73,9%) |
| Rua | `rua` (0,4%) | `street_name` (57,1%) |
| Número | `numeroendereco` (0,3%) | `address_number` (6,6%) |
| Complemento | `complementoendereco` (0,2%) | `address_complement` (3,0%) |
| Tags/etiquetas | `tagids` (0,4%), `tags` (0%, campo morto) | `tag_ids` (91,7%) |

## Mapeamento de campos: `people` → `Pessoa`

| Mongo `people` | Rede Mobiliza `Pessoa` | Regra |
|---|---|---|
| `name` + `surname` | `nome` | Concatenar |
| `email` | `email` | Direto |
| `cpf` | `cpf` | Direto (só 4,6% preenchido) |
| `birth_date` | `nascimento` | Direto |
| `cep` | `cep` | Direto (71,3% preenchido) |
| `street_name` | `logradouro` | Direto |
| `address_number` | `numero` | Direto |
| `address_complement` | `complemento` | Direto |
| `city_id`/`city_label` (ou tag type=City) | `regiaoId` (nível "cidade", pai da hierarquia) | Ver hierarquia de região |
| `neighborhood_id`/`neighborhood_label` (ou tag type=Neighborhood) | `regiaoId` (nível "bairro", filho — este é o valor real gravado na pessoa) | Ver hierarquia de região |
| `gender_id` | `genero` | Ver decodificação acima |
| `religion_id` | `religiao` | Ver decodificação acima |
| tag type=Schooling | `escolaridade` | Via `tag_ids` |
| tag type=Profession | `profissaoId` | Via `tag_ids`, criar/casar com catálogo `Profissao` |
| tag type=Segment | `Segmento` (relação `PessoaSegmento`) | Via `tag_ids` — ver "Segmentos (deduplicação e casos especiais)" abaixo para as 4 fusões confirmadas |
| `deleted` | `deletedAt` | `true` → timestamp de soft-delete (usar `updated_at` como aproximação); `false`/ausente → `null` |
| `coordinates` | reaproveitar, sem geocodificar de novo | Campo `[longitude, latitude]` (confirmar ordem antes de gravar) |
| `role` (valores: none/null, leader_agent, agent, staff, admin, senator, superadmin, candidate) | **Não vira `isMobilizador`/`isColaborador` nesta importação.** Todos entram como `Pessoa` comum, sem acesso ao sistema. | Usuário decide promoção depois, pessoa por pessoa. Preservar o valor de `role` como anotação/observação visível para orientar essa decisão futura (ex: `ObservacaoPessoa` com texto "Papel no sistema anterior: leader_agent") — aplica-se a ~292 pessoas com role diferente de none/null. |
| `created_by_id` | `VinculoRede.indicadoPorId` | Ver seção de rede de indicação — com exclusões |
| Sem campo Mongo equivalente | `zonaEleitoral`, `secaoEleitoral` (campos NOVOS) | Ficam vazios na importação (Mongo tem `electoral_section`/`electoral_zone` em 14,3% dos registros — trazer esse valor se existir, já que os campos novos vão existir desde o dia 1 da Fase 1) |
| Sem equivalente | `origem` | Preencher com valor fixo tipo "Importado do sistema anterior (MongoDB)" |

**Nota**: `electoral_section`/`electoral_zone` do Mongo (14,3% preenchido) alimentam os novos campos `zonaEleitoral`/`secaoEleitoral` da Fase 1 — a funcionalidade pedida pelo usuário (aparecer só na tela de edição, não no cadastro inicial) vale para cadastros novos feitos depois; nos importados, o valor já vem preenchido desde a migração.

## Telefones (`phones` → `whatsapp` + telefone extra)

- Coleção `phones` não tem `tenant_id` direto, só `person_id` (chave estrangeira pra `people._id`).
- Estrutura: `{ type: "cellphone"|"landline", number: "6198...", person_id }`.
- Regra de escolha do `whatsapp` principal (decisão do usuário): **preferir celular sobre fixo**; entre múltiplos celulares, usar o mais recente (sem campo de data direto em `phones` — decidir na implementação se usa ordem de inserção do `_id` do Mongo, que é cronológico, como proxy de "mais recente").
- Números adicionais (quando a pessoa tem mais de 1 telefone) vão para a **estrutura nova de telefone extra** criada na Fase 1 (schema pronto para acomodar, sem botão de UI "ADICIONAR TELEFONE" ainda — isso é funcionalidade do próximo sprint, fora deste projeto).
- Números vêm sem formatação (dígitos crus) — normalizar com a mesma função `normalizeWhatsApp` já usada no resto do sistema; números inválidos após normalização precisam de uma regra (registrar sem telefone principal? pular a pessoa? decidir na Fase 3).

## Hierarquia de Região (Cidade → Bairro)

Decisão confirmada: adicionar campo opcional `regiaoPaiId` (autorreferente) ao modelo `Regiao` — uma região pode ter uma "região-mãe". Uma pessoa sempre é vinculada ao nível mais granular (bairro); filtrar pela região-mãe (cidade) deve incluir automaticamente todos os filhos.

- Fonte: tags `type: "City"` (77 valores no tenant Izalci, confirmado por query direta no backup — nem todos do DF, ver abaixo) viram as regiões-mãe; tags `type: "Neighborhood"` (centenas de valores, muitos com sufixo entre parênteses indicando a cidade-mãe, ex: "Taguatinga Norte (Taguatinga)") viram as regiões-filhas.
- Decisão do usuário: **importar toda a granularidade real** (não simplificar agora) — mas isso **não significa nenhuma fusão**: pares de tag `City` confirmados pelo usuário como o mesmo lugar (revisão manual da lista completa das 77 cidades em sessão de acompanhamento, 18/07) fundem durante a importação; qualquer outra semelhança de texto (abreviação, sufixo, nome parecido) **não funde automaticamente por algoritmo** — só por confirmação humana como esta, caso a caso.
- **Fusões de cidade confirmadas** (Fase 2):
  - `Sol Nascente - Pôr do Sol` + `Sol Nascente/Pôr do Sol` → mesma cidade (só diferença de pontuação).
  - `Guará` + `Guará / Lúcio Costa` → cidade vira só `Guará`. Sem perda de informação: já existe um bairro (`Neighborhood`) próprio chamado `LUCIO COSTA` no tenant — pessoas com esse bairro continuam com ele; só a tag de cidade composta deixa de existir como cidade própria.
- **Confirmado como NÃO-duplicata** (aparência parecida, lugares reais distintos — nunca fundir): `Riacho Fundo` / `Riacho Fundo II`, `Sobradinho` / `Sobradinho II`, `Planaltina` (RA do DF) / `Planaltina Goiás` (município de Goiás, cidade vizinha diferente), `Guará` / `Guará II` (bairros). O usuário confirmou cada um desses como Região Administrativa/bairro genuinamente distinto — reforça por que a fusão automática por semelhança de texto foi descartada como regra geral.
- **Cidades fora do DF**: das 77 tags `City` do tenant, 41 são de fora do DF (municípios do Entorno em Goiás e contatos raros de outros estados — lista revisada e confirmada uma a uma com o usuário em 18/07). **Não são removidas nem fundidas** — continuam no banco normalmente, como qualquer outra `Regiao`. Pedido do usuário para um **sprint futuro** (fora desta importação): filtro na Central de Filtros com 3 modos — "Somente DF", "DF + uma ou mais regiões/cidades específicas" e "Somente fora do DF".
- **Funcionalidade nova pedida para o próximo sprint** (fora deste projeto): uma ferramenta de admin para escolher uma região e mesclá-la com outra, mantendo um nome só e re-apontando as pessoas vinculadas — isso resolve os casos de digitação/abreviação que não foram confirmados nesta sessão, com curadoria humana, em vez de tentar adivinhar automaticamente.
- Onde o `Neighborhood` tag não tiver cidade-mãe óbvia (nem sufixo entre parênteses, nem correspondência clara), decidir caso a caso na Fase 2.

## Rede de indicação (`created_by_id` → `VinculoRede`)

Investigação: `created_by_id` aponta para outra `people` (confirmado — não para uma conta de sistema genérica). 78,9% das pessoas têm esse campo preenchido (112.407 de 142.489).

**Achado crítico**: duas contas dominam completamente a distribuição — são **desenvolvedores do sistema antigo**, confirmados pelo usuário via e-mail:
- **Gustavo Vieira Silva** — `_id: 67605433e30de14b89780451`, e-mail `gustavo.vieira@dubbox.com.br`, role `superadmin` — 54.680 pessoas "criadas" (contagem ao vivo confirmada; o campo `people_created` do próprio documento, 3.714, está desatualizado/não confiável)
- **Luar Faria** — `_id: 6063a6ccc3e599000464eaa7`, e-mail `luar@legislapp.com.br`, role `admin` — 40.478 pessoas "criadas" (contagem ao vivo confirmada; campo próprio `people_created: 40224` é aproximado mas próximo)

Juntas, essas 2 contas respondem por ~85% de todos os `created_by_id` preenchidos — claramente entrada de dados em massa/importação técnica, não indicação pessoa-a-pessoa real.

**Regra de importação decidida**:
1. Pessoas cujo `created_by_id` seja um desses 2 IDs entram na `Pessoa` normalmente, mas **sem `indicadoPorId`** (entram soltas, sem indicador, direto na raiz da rede do gabinete).
2. Para todo o resto de `created_by_id` (incluindo contas com volume alto mas legítimo, como o próprio usuário — `Renato Fernandes Ferreira`, superadmin, 105 pessoas — e outros indicadores com até ~1000+ cadastros que passaram no teste de nome real), usar normalmente como `indicadoPorId`.
3. **Exclusão adicional, como pessoas (não só como indicador)**: ~5 registros de teste/dummy criados pelo Luar Faria durante testes do sistema (ex: "Luar 2 Faria", "Luar 3 Faria doido", e-mails com "teste"/"legislapp") — não são pessoas reais, não devem ser importados como `Pessoa` de jeito nenhum. Identificar antes da Fase 3 com uma query específica (`created_by_id` = Luar E (`email` contém "legislapp"/"teste" OU `name` contém "teste"/"luar")) e excluir.
4. `network_id`/coleção `user_networks` — **não usar**. Representa algo mais grosso (qual "sistema"/rede geral a pessoa pertence, ex: "Sistema IZALCI" com uma lista de 38 IDs de quem-sabe-o-quê), não uma relação de indicação individual utilizável.

`VinculoRede.nivel` — calcular a partir da profundidade da cadeia de `created_by_id` (quantos saltos até chegar em alguém sem indicador, respeitando a exclusão das 2 contas de desenvolvedor como "raiz").

## Segmentos (deduplicação e casos especiais)

Investigação direta no backup (`tags.bson.gz`/`people.bson.gz`, tenant Izalci, sessão de acompanhamento 18/07): 207 tags `type: "Segment"`, e **77.638 de 142.489 pessoas (~54%)** têm ao menos uma — é um campo de altíssimo uso, não um extra de baixa prioridade.

- **Fusões confirmadas pelo usuário** (mesmo padrão de curadoria humana da seção de Região acima — não é fusão automática por algoritmo):
  - `ABEDUQ` + `ABEDUQ - CHEQUE-EDUCAÇÃO` → mesmo segmento.
  - `BOLSA UNIVERSITÁRIA` + `B. UNIVERSITARIA` → mesmo segmento.
  - `CRC-DF` + `CRC-DF - CONSELHO REGIONAL DE CONTABILIDADE` → mesmo segmento.
  - `DF DIGITAL` + `TELECENTROS - DF DIGITAL` → mesmo segmento.
  - (nome canônico final de cada par — qual dos dois textos vira o `Segmento.nome` — fica pra Fase 2, sem impacto funcional na escolha.)
- **`BANCO ANTIGO`** (66.511 pessoas — o segmento mais usado de todos, quase metade do tenant): investigação inicial suspeitou que fosse ruído técnico de migração. **Não é** — decisão do usuário (18/07): representa pessoas vindas de um sistema de campanha **anterior a este** (mais antigo que o sistema Legislapp, que por sua vez é mais antigo que o Rede Mobiliza). Mantém como `Segmento` normal, importado sem exclusão — o usuário quer poder filtrar quem vem desse sistema legado mais antigo.
- Nenhuma outra tag de Segmento foi identificada como duplicata nesta revisão — as 207 menos os 4 pares acima entram uma a uma, sem fusão.

## Banco de Talentos (`curriculums` → `BancoTalentos`)

Mapeamento direto, confirmado (todos os 548 registros pertencem ao tenant Izalci via `person_id`):

| Mongo `curriculums` | Rede Mobiliza `BancoTalentos` |
|---|---|
| `priority` (mesmo default: 3) | `prioridade` |
| `has_disability` | `isPcd` |
| `found_job` | `colocado` |
| `employment_role_ids` (lista) | `areas` (relação `BancoTalentosArea` com `AreaColocacao`) |
| `who_indicate` + `observation` | `observacao` (concatenar os dois quando ambos preenchidos) |
| `curriculum_file_data` | **Não trazer** — arquivo real não recuperável (mesmo problema de `photo_data`) |

## Ferramenta ViaCEP + Nominatim (anotado para funcionalidade futura, fora desta importação)

- Ao digitar CEP num cadastro **novo** (pós-importação), preencher endereço via **ViaCEP** (gratuito, sem chave de API).
- Coordenadas geográficas do endereço resultante via **Nominatim** (OpenStreetMap) — já é o provedor usado hoje em `src/lib/geocodificar-regiao.ts`, reaproveitar o mesmo padrão de chamada (limite de 1 requisição/segundo, `User-Agent` identificado).
- Pessoas importadas do Mongo **não precisam** desse fluxo — já vêm com coordenada própria quando existente (58,3% dos casos).
- Esta funcionalidade **não faz parte das 5 fases abaixo** — é um item para uma sprint futura, só documentado aqui para não se perder.

## Fases de implementação propostas

1. **Fase 1 — Fundação de schema**: `regiaoPaiId` em `Regiao`; campos `zonaEleitoral`/`secaoEleitoral` em `Pessoa` (visíveis só na edição, não no cadastro inicial); nova estrutura de telefone extra (schema só, sem UI de "ADICIONAR TELEFONE" — isso é próximo sprint); criação do gabinete IZALCI.
2. **Fase 2 — Catálogos**: construir `Regiao` (hierarquia cidade/bairro), `Profissao`, `Segmento`, `AreaColocacao` a partir das tags do Mongo.
3. **Fase 3 — Importação de Pessoas + Telefones**: script de ETL com todo o mapeamento acima; exclusão dos ~5 registros de teste do Luar; teste em staging com lote pequeno primeiro, depois staging completo, depois produção.
4. **Fase 4 — Banco de Talentos**: importar `curriculums` → `BancoTalentos`/`BancoTalentosArea`.
5. **Fase 5 — Rede de indicação**: importar `created_by_id` → `VinculoRede`, com as exclusões definidas.

Cada fase vira um plano formal próprio (`docs/superpowers/plans/`), executado e revisado (subagent-driven-development) antes de avançar pra próxima — mesmo padrão já usado nas rodadas de auditoria desta sessão.

## Itens em aberto para decidir durante a implementação (não bloqueiam o início)

- Regra exata de "mais recente" entre múltiplos celulares de uma pessoa (proxy via ordem do `_id` do Mongo, a definir na Fase 3).
- O que fazer com números de telefone inválidos após normalização (pular a pessoa? cadastrar sem `whatsapp`?).
- Onde uma tag `Neighborhood` não tiver cidade-mãe óbvia, decidir agrupamento caso a caso (Fase 2).
- Formato exato de armazenar o `role` legado como anotação (texto livre em `ObservacaoPessoa`, ou outro mecanismo) — Fase 3.
- Estratégia de deduplicação de WhatsApp colidindo com o índice único parcial já existente (`Pessoa.whatsapp` por gabinete, `WHERE deletedAt IS NULL`) — decidir regra exata (pular e listar para revisão manual) na Fase 3.
