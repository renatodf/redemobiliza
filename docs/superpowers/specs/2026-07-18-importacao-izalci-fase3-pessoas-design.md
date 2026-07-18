# Importação Izalci — Fase 3: Pessoas + Telefones — Spec

## Contexto

Terceira das 5 fases descritas em `docs/superpowers/specs/2026-07-18-importacao-izalci-mongodb-design.md` (spec-mãe da importação da base MongoDB do senador Izalci Lucas). Fase 1 (fundação de schema) e Fase 2 (catálogos: `Regiao`/`Profissao`/`Segmento`/`AreaColocacao`) já implementadas, mergeadas e rodadas em staging e produção. O gabinete **IZALCI** já existe em produção, com os 4 catálogos populados.

Esta fase importa as `Pessoa` reais do Mongo (coleção `people`, tenant Izalci) e os telefones adicionais (`TelefoneExtra`), vinculando cada pessoa aos catálogos já criados na Fase 2. **Nenhuma rede de indicação (`VinculoRede`) é criada nesta fase** — isso é Fase 5. **Nenhum currículo/Banco de Talentos** — isso é Fase 4.

## Diferença de risco em relação às Fases 1-2

Esta é a primeira fase que escreve **dado pessoal real de gente de verdade** (nome, WhatsApp, e-mail, CPF, endereço) em produção, em volume grande (142.489 registros candidatos). Duas decisões de arquitetura desta spec existem especificamente por causa disso — ver "Artefato de ETL" e "Arquitetura do ETL" abaixo.

## Escopo — quem entra

- 142.489 pessoas do tenant Izalci (`tenant_id = ObjectId("60b7934c0cc64a0004717e9d")`).
- **Excluídos como pessoa, não só como indicador**: ~5 registros de teste/dummy criados por Luar Faria durante testes do sistema antigo (`created_by_id` = Luar E (`email` contém "legislapp"/"teste" OU `name` contém "teste"/"luar") — regra já confirmada no spec-mãe). Identificar antes de importar, excluir por completo.
- **127.398 pessoas com WhatsApp válido entram nesta rodada.** As demais ficam de fora desta importação (não descartadas — só não importadas agora), listadas num relatório de execução (nome, `_id` do Mongo, motivo) que fica só no scratchpad, nunca commitado:
  - **15.091 pessoas sem nenhum telefone válido** (nem fixo, nem celular, após normalização) — não têm como preencher o campo obrigatório `Pessoa.whatsapp`.
  - **Duplicata de WhatsApp entre pessoas do próprio tenant**: `Pessoa.whatsapp` tem índice único parcial por gabinete (`WHERE deletedAt IS NULL`). A primeira pessoa processada com um número normalizado entra normal; qualquer pessoa seguinte com o mesmo número fica de fora, listada.
- As **16.612 pessoas que só têm telefone fixo** (sem celular) **entram normalmente** — o fixo vira tanto `whatsapp` quanto `telefoneFixo` (decisão desta sessão, ver "Telefones" abaixo).

## Mapeamento de campos: `people` → `Pessoa`

Já definido e confirmado no spec-mãe (seção "Mapeamento de campos: `people` → `Pessoa`") — reproduzido aqui só onde há nuance decidida nesta sessão:

- `name` + `surname` → `nome` (concatenar); `email`, `cpf`, `birth_date`→`nascimento`, `cep`, `street_name`→`logradouro`, `address_number`→`numero`, `address_complement`→`complemento` direto.
- `city_id`/`neighborhood_id` (ou tags equivalentes) → `regiaoId`, resolvido pelo catálogo `Regiao` já criado na Fase 2 (bairro é o nível gravado na pessoa; cidade só entra se não houver bairro — ver spec-mãe).
- `gender_id`/`religion_id` → `genero`/`religiao` via decodificação já confirmada (spec-mãe).
- tag `Schooling`/`Profession` → `escolaridade`/`profissaoId`, catálogo já criado na Fase 2.
- tag `Segment` (múltiplas por pessoa) → `PessoaSegmento`, catálogo já criado na Fase 2. **Sem limite de cardinalidade** — toda tag de Segmento que a pessoa tiver vira uma linha, garantia já registrada no spec-mãe.
- `deleted` → `deletedAt` (`true` → timestamp usando `updated_at` como aproximação; ausente/`false` → `null`).
- `electoral_section`/`electoral_zone` (14,3% preenchido) → `secaoEleitoral`/`zonaEleitoral` quando existirem.
- `origem` → valor fixo `"Importado do sistema anterior (MongoDB)"`.
- **`coordinates` (58,3% preenchido na origem) — decisão desta sessão: descartado, não entra.** `Pessoa` não tem campo de latitude/longitude no schema atual (só `Regiao` tem, populado na Fase 2); o mapa do Dashboard já funciona agregado por Região, sem precisar de coordenada por pessoa. Não justifica estender o schema só pra guardar um dado sem uso hoje — se um mapa por pessoa for desejado no futuro, é feature nova com spec própria.
- **`role`** (~292 pessoas com valor diferente de none/null) → **não vira** `isMobilizador`/`isColaborador` (decisão já confirmada no spec-mãe — todo mundo entra como `Pessoa` comum). Preservado como `ObservacaoPessoa` com texto `"Papel no sistema anterior: {role}"`. **Decisão desta sessão sobre o autor da observação** (campo obrigatório, não pode ser um admin real já que ninguém revisou pessoa por pessoa): `autorNome = "Importação Izalci (sistema anterior)"`, `autorUserId` = uma string sentinela fixa (ex.: `"sistema-importacao-izalci"`, definir exata na implementação) — deixa claro na ficha da pessoa que a nota veio da migração, não de um admin de verdade.

## Telefones (`phones` → `whatsapp` + `TelefoneExtra`)

- Regra de escolha do `whatsapp` principal (spec-mãe): preferir celular sobre fixo; entre múltiplos celulares, o mais recente (proxy: ordem de inserção do `_id` do Mongo, cronológico).
- **Decisão desta sessão**: pessoa que só tem telefone(s) fixo(s) (sem nenhum celular) usa o fixo como `whatsapp` **também** (além de continuar em `telefoneFixo`) — é o único contato disponível, e não faz sentido jogar 16.612 pessoas na lista de "sem telefone" só por não terem celular. Quem for contatar identifica pelo formato do número que não é celular.
- Todo número além do escolhido como `whatsapp` (mais celulares, mais fixos) vira uma linha em `TelefoneExtra` — sem limite de quantidade, mesmo padrão de completude já usado pra Segmento.
- Números sem formatação no Mongo — normalizar com `normalizeWhatsApp` (já usada no resto do sistema).

## Arquitetura do ETL

**Sem estágio Python + JSON intermediário committado** (diferente da Fase 2) — o JSON da Fase 2 só tinha nomes de catálogo, sem dado pessoal, seguro pra commitar como artefato revisável. Aqui o artefato conteria nome/CPF/WhatsApp/e-mail de 142 mil pessoas reais — **nunca vai pro git**, nem em rascunho, nem como exemplo.

- Um único script TypeScript (`scripts/importacao-izalci/importar-pessoas-fase3.ts`), rodado via `npx tsx`, mesmo padrão de conexão Prisma direto das fases anteriores.
- Lê o backup MongoDB (`people.bson.gz`/`phones.bson.gz`) diretamente (sem passar por Python desta vez, já que não há necessidade de um artefato de revisão humana em arquivo — a revisão acontece por amostragem de log/contagem durante a execução, não por arquivo).
- Resolve `regiaoId`/`profissaoId`/`Segmento` consultando os catálogos já criados na Fase 2 no Postgres (por nome), não recriando lógica de decodificação de tag do zero.
- Inserção em lotes via `prisma.pessoa.createManyAndReturn` (recurso nativo do Prisma, sem dependência nova) para obter os ids gerados e usá-los nas tabelas dependentes (`PessoaSegmento`, `TelefoneExtra`, `ObservacaoPessoa`) na sequência — criar pessoa por pessoa com `await` individual (padrão da Fase 2) é inviável em 142 mil registros.
- Relatório de execução (contagens, lista de pessoas puladas com motivo) impresso no terminal e opcionalmente salvo em arquivo **fora do repositório** (scratchpad da sessão) — nunca committado.

### Rollout em 3 estágios (já definido no spec-mãe, detalhado aqui)

1. **Lote pequeno em staging** (~500 pessoas), contra o gabinete de teste já usado na Fase 2 — valida a mecânica (resolução de catálogo, escolha de whatsapp, exclusões, sem erro) antes de qualquer escala.
2. **Lote completo em staging** (as 127.398 pessoas elegíveis), mesmo gabinete de teste — valida em escala real antes de tocar produção.
3. **Lote completo em produção** (gabinete IZALCI) — só depois do passo 2 confirmado limpo.

## Testes

Sem testes automatizados de integração com Mongo/Postgres real (mesmo padrão já estabelecido nas Fases 1-2). Validação por contagem exata e amostragem em cada um dos 3 estágios do rollout — comparar contagens esperadas (derivadas do escopo acima) contra o banco real depois de cada estágio, antes de avançar pro próximo.

## Fora de escopo (confirmado)

- `VinculoRede` (rede de indicação) — Fase 5.
- `curriculums`/Banco de Talentos — Fase 4.
- Coordenada individual por pessoa — descartada (ver mapeamento acima).
- As 15.091 pessoas sem telefone válido e as pessoas puladas por duplicata de WhatsApp — não importadas nesta rodada, ficam para decisão futura (fora desta fase).
