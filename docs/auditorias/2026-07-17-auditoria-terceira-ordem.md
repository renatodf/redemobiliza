# Auditoria de Terceira Ordem — Rede Mobiliza (2026-07-17)

> Investigação real, baseada em evidência (leitura direta de código + schema + introspecção SQL ao vivo em produção e staging), executada após duas rodadas anteriores de auditoria (P0 + regressão) já corrigidas e deployadas até o commit `d3ac4c7`. Nenhuma correção foi aplicada nesta fase — é investigação pura, por escolha explícita do usuário.

## 0. Metodologia e limitações declaradas

- 5 investigações paralelas (forks), cada uma cobrindo uma área do sistema não tocada pelas duas auditorias anteriores: (1) exportação/jobs assíncronos, (2) Demanda/cron, (3) auth/RLS/middleware/modo-suporte, (4) Banco de Talentos/Segmento/integridade referencial, (5) concorrência/idempotência em Server Actions.
- Todo achado marcado **CONFIRMADO** foi verificado por mim de forma independente (leitura direta do arquivo/schema, ou query SQL ao vivo), não apenas aceito do relatório do fork.
- Achados marcados **PLAUSÍVEL** têm evidência de código real mas dependem de timing/condição de corrida que não foi reproduzida ao vivo.
- **O que esta auditoria NÃO prova, e por quê:**
  - **Chaos engineering / falhas de infraestrutura induzidas** (queda de rede, timeout de DB no meio de transação): exigiria injeção de falha controlada em produção ou staging, o que não foi autorizado nem seria responsável fazer sem uma janela de manutenção dedicada.
  - **1000 logins concorrentes / carga real**: exigiria uma ferramenta de load-test apontada para staging; não foi executada nesta fase. As análises de concorrência aqui são por leitura de código (padrão check-then-act vs. constraint de banco), não por reprodução sob carga.
  - **Deriva de dados ao longo de meses**: exigiria dados históricos de produção que não existem (o sistema é recente) ou uma simulação de longo prazo, nenhuma das duas disponível.
  - Onde essas camadas seriam relevantes para um achado específico, isso está marcado explicitamente na seção do achado.

---

## 1. Achados CONFIRMADOS (evidência direta, verificada por mim)

### 1.1 — RLS habilitado, zero políticas, em produção E staging (CRÍTICO — risco latente)

**Evidência (query SQL ao vivo, executada por mim nos dois bancos):**

| Ambiente | Tabelas com RLS habilitado | Políticas (`pg_policies`) |
|---|---|---|
| Produção (`hqyirlcmhrfdnzshbniy`) | 19 de 19 | **0** |
| Staging (`xoczohjjqtowskzbxrdr`) | 19 de 19 | **0** |

`scripts/setup-supabase.sql` documenta políticas para 11 tabelas que nunca foram aplicadas (ou foram removidas) nos bancos reais. As outras 7 tabelas (`AreaDemanda`, `Demanda`, `MovimentacaoDemanda`, `ConfiguracaoSistema`, `AreaColocacao`, `BancoTalentos`, `BancoTalentosArea`) nunca tiveram política nenhuma planejada.

**Impacto hoje: zero.** Confirmado por grep completo em `src/` e `scripts/`: não existe nenhuma chamada `.from(<tabela>)` via cliente Supabase (só `.storage.from('gabinete-assets')`, que é bucket) nem `createBrowserClient` em lugar nenhum. Toda leitura/escrita passa por Prisma com a service-role key, que ignora RLS incondicionalmente.

**Risco que isso planta para o futuro:**
1. Se qualquer código futuro fizer uma query direta via cliente Supabase (anon/authenticated key, client-side), o retorno hoje é `200 OK` com array vazio — parece "sem dados", não "sem permissão". Ninguém vai suspeitar de RLS porque a documentação (`setup-supabase.sql`) afirma que a política existe.
2. As 7 tabelas nunca cobertas pelo script original já têm RLS ligado e grants completos de `anon`/`authenticated` (confirmado via `information_schema.role_table_grants`) — falta *apenas* alguém escrever uma política mal feita (`USING (true)` sem escopo por `gabineteId`) para virar vazamento cross-tenant real, sem precisar de nenhuma outra mudança de config.

**Causa mais provável:** uso do botão "Enable RLS" em massa do Security Advisor do Supabase (só executa `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, nunca cria política) — a assinatura característica é `_prisma_migrations` também estar com RLS habilitado, tabela que nenhuma migração do projeto jamais tocaria.

**Por que as duas auditorias anteriores não pegaram isso:** ambas leram `setup-supabase.sql` como fonte de verdade (documentação estática) em vez de consultar `pg_policies`/`pg_class.relrowsecurity` nos bancos reais.

**Correção recomendada:** reaplicar `setup-supabase.sql` nos dois bancos + escrever políticas equivalentes para as 7 tabelas fora do escopo original; mover a aplicação para o pipeline de migração (hoje é 100% manual — motivo raiz da divergência silenciosa); adicionar um teste de CI que compara `pg_class.relrowsecurity` com `pg_policies` e falha se divergir.

---

### 1.2 — Duplicata silenciosa sob concorrência: `AreaDemanda` e `Segmento` sem unique constraint (ALTO)

Ambos seguem o padrão `findFirst` (verifica duplicata) → `create`, sem transação nem lock, e **nenhum dos dois modelos tem `@@unique`** no schema — confirmado por leitura direta de `prisma/schema.prisma`:

- `AreaDemanda`: só `@@index([gabineteId])`.
- `Segmento`: nenhum `@@unique`/`@@index` em campo nenhum, nem em `slug`.

**Cenário de falha:** duplo clique, ou dois admins simultâneos criando a mesma área/segmento — ambos passam no `findFirst` (nenhum commitou ainda) e ambos criam. **Não há erro, não há sinal do problema** — pior que um crash, porque gera duplicata silenciosa que só aparece depois, em relatórios ou filtros.

Arquivos: `src/actions/admin/criar-area-demanda.ts:14-19`, `src/actions/admin/criar-segmento.ts:17-26`.

**Correção:** `@@unique([gabineteId, nome])` em `AreaDemanda` e `@@unique([gabineteId, slug])` em `Segmento` (migration nova, mesmo padrão de índice único parcial já usado para `Pessoa`/`VinculoRede` se algum dia esses modelos ganharem soft-delete — hoje não têm `deletedAt`, então pode ser `@@unique` normal) + catch de P2002 nas duas actions.

---

### 1.3 — Constraint existe mas não é tratada: crash não tratado sob corrida (MÉDIO)

Classe oposta à 1.2: aqui o unique constraint **existe de verdade**, mas o `create`/`update` não tem try/catch de P2002 — sob corrida real, a segunda escrita lança exceção não tratada (tela de erro genérica do Next, ver o gotcha de sanitização de mensagem já documentado nas correções desta sessão), em vez do redirecionamento amigável "já existe".

Confirmado por leitura direta:
- `src/actions/admin/criar-area-colocacao.ts:14-30` — `AreaColocacao` tem `@@unique([gabineteId, nome])` real (`prisma/schema.prisma`), mas nem `create` nem `update` têm catch de P2002.
- `src/actions/super-admin/criar-gabinete.ts:31-38` e `editar-gabinete.ts:27-37` — `Gabinete.slug` é unique (confirmado pelo uso de `findUnique({where:{slug}})`, só permitido em campo `@unique`/`@id`), mesmo padrão sem catch. Severidade baixa na prática (operação rara, feita por humano, baixíssima concorrência).

**Correção:** try/catch de P2002 nos três arquivos, retornando a mesma mensagem amigável do ramo "já existe".

---

### 1.4 — Inconsistência de filtro `deletedAt` entre actions irmãs (MÉDIO)

`src/actions/admin/criar-demanda.ts:40-43` — o `solicitanteCheck` **não** filtra `deletedAt: null`, enquanto o equivalente em `src/actions/admin/criar-demanda-com-cadastro.ts:74-78` filtra. Resultado: dá para criar uma `Demanda` com `solicitanteId` apontando para uma `Pessoa` soft-deletada pelo fluxo "criar demanda" simples, mas não pelo fluxo "criar demanda com cadastro".

Achado novo — fora do escopo das correções já feitas nesta sessão (que só tocaram lookups de `whatsapp`/`tokenMobilizador`/`VinculoRede`).

**Correção:** adicionar `deletedAt: null` ao `solicitanteCheck` para paridade com o arquivo irmão.

---

### 1.5 — Banco de Talentos expõe currículo de pessoa soft-deletada (ALTO)

`buildWhereBancoTalentos` em `src/lib/filtros-banco-talentos.ts` — confirmado por leitura direta: o tipo `WhereBancoTalentos` e a função construtora só filtram `pessoa: { gabineteId }`, **sem `deletedAt` em lugar nenhum**. Uma pessoa soft-deletada continua com o currículo/entrada no Banco de Talentos visível e exportável.

**Correção:** adicionar `pessoa: { gabineteId, deletedAt: null }` ao filtro base.

---

### 1.6 — `Segmento` sem nenhuma constraint de integridade (ALTO — já coberto em parte por 1.2)

Confirmado por leitura direta do schema: `model Segmento` não tem **nenhum** `@@unique` nem `@@index`, nem em `slug`. Isso é uma garantia de integridade mais fraca do que até o `Pessoa`/`VinculoRede` tinham *antes* das correções desta sessão (que ao menos tinham `@@unique`, só que na forma errada para soft-delete).

---

### 1.7 — Exportação síncrona sem limite/job assíncrono real (MÉDIO)

`src/app/api/[slug]/filtros/pessoas/exportar/route.ts` e `.../demandas/exportar/route.ts` — confirmado por leitura direta: existe uma constante `LIMITE_EXPORT_SINCRONO = 500` em `src/lib/filtros-pessoas.ts`, mas o endpoint de exportação de **demandas** não tem nenhuma lógica de limite ou fallback assíncrono equivalente — uma base grande de demandas gera uma exportação síncrona sem teto, prendendo a requisição HTTP e o worker até terminar.

---

### 1.8 — Cron de verificação de demandas não é atômico (MÉDIO)

`src/app/api/cron/verificar-demandas/route.ts` (124 linhas, lido por completo) — confirmado: o cron itera demandas e faz updates individuais em loop, sem `$transaction`. Uma falha no meio do processamento deixa um subconjunto de demandas atualizado e outro não, sem qualquer registro/retry do que ficou pra trás.

---

### 1.9 — Parsing de data sem timezone em `alterar-prazo-demanda.ts` (BAIXO/MÉDIO — plausível, não reproduzido ao vivo)

`src/actions/admin/alterar-prazo-demanda.ts:42` — `new Date(novoPrazo)`, onde `novoPrazo` vem de um campo de formulário tipo `date` (string `YYYY-MM-DD`, sem componente de hora). Strings de data pura são interpretadas pelo `Date` do JS como **UTC meia-noite**, não meia-noite local. Se o valor for depois exibido no timezone de Brasília (UTC-3) sem normalização, o prazo pode aparecer com um dia a menos do que o admin digitou. Não reproduzi isso ao vivo (dependeria de onde exatamente o valor é renderizado, servidor vs. cliente) — classificado **PLAUSÍVEL**, não confirmado por reprodução.

---

## 2. Achados PLAUSÍVEIS (evidência de código real, mas dependem de timing não reproduzido)

### 2.1 — Falso positivo de "conta órfã" em promoção de mobilizador sob corrida

`src/lib/supabase/criar-usuario-mobilizador.ts:32-58`, chamado por `promover-mobilizador.ts`. Se dois admins promoverem a mesma `Pessoa` quase simultaneamente: o Supabase Auth garante unicidade de e-mail no `createUser`, então só uma chamada cria a conta; a segunda recebe "already been registered" e cai num fallback que verifica `prisma.pessoa.findFirst({where:{userId}})` para decidir se a conta é "órfã". Se essa checagem rodar **antes** da transação Postgres da primeira requisição commitar, o segundo admin recebe uma mensagem de "conta órfã, peça para super-admin deletar manualmente" — falso positivo que pode induzir a deleção de uma conta legítima recém-criada. Janela estreita, sem corrupção de dado real (não cria duas contas), mas o texto de erro induz uma ação humana perigosa.

**Correção sugerida:** re-checar `Pessoa.findFirst` uma segunda vez antes de concluir "órfã", ou mover a decisão para dentro da mesma transação que cria o vínculo.

---

## 3. Achados de baixa severidade / gap de design a confirmar

- `src/actions/admin/criar-profissao.ts:14-16` e `criar-regiao.ts:18-20` — `create` direto, zero verificação de duplicata; `Profissao`/`Regiao` não têm unique constraint. Parecem catálogos livres — reportar como gap de design a confirmar com o time, não como bug crítico.
- `criar-regiao.ts:18-28` — `create` da região seguido de `update` separado (não-transacional) para geocodificação; se `geocodificarRegiao` lançar, a região já foi criada (sem coordenadas) mas a action inteira propaga erro — admin vê "falhou" quando na verdade criou parcialmente.
- TOCTOU em `submeter-cadastro.ts` (rota pública) sob double-submit: já reportado e endereçado como achado C no plano `2026-07-17-auditoria-fixes-remanescentes.md`, corrigido no Task 7 (catch de P2002 em volta do `create`). Mantido aqui só como referência cruzada — **não é um achado novo**.

---

## 4. Confirmado como SEM problema (evidência de que está correto)

- `src/actions/admin/excluir-pessoas-em-massa.ts:14-17` — `updateMany` único e atômico, não é loop sequencial.
- `src/actions/admin/revogar-mobilizadores-em-massa.ts:20-32` — `$transaction([updateMany, deleteMany])`, atômico.
- `src/actions/mobilizador/marcar-desfecho-demanda.ts` — duplo submit no pior caso gera entrada de histórico duplicada (cosmético), não corrompe estado.
- `src/actions/admin/criar-demanda-com-cadastro.ts` — usa `$transaction` corretamente para solicitante+demanda.

---

## 5. Matriz de risco consolidada (achados desta fase apenas)

| # | Achado | Severidade | Confirmação | Exploração requer |
|---|---|---|---|---|
| 1.1 | RLS sem políticas (prod+staging) | Crítico (latente) | Confirmado (SQL ao vivo) | Um dev futuro adicionar acesso client-side ao Supabase |
| 1.2 | Duplicata silenciosa `AreaDemanda`/`Segmento` | Alto | Confirmado | Concorrência real (2 requisições simultâneas) |
| 1.5 | Banco de Talentos vaza pessoa soft-deletada | Alto | Confirmado | Nenhuma — já explorável hoje |
| 1.6 | `Segmento` sem integridade nenhuma | Alto | Confirmado | Concorrência ou erro de digitação |
| 1.3 | Crash não tratado (constraint sem catch) | Médio | Confirmado | Concorrência real |
| 1.4 | `criar-demanda.ts` sem `deletedAt` | Médio | Confirmado | Nenhuma — já explorável hoje |
| 1.7 | Exportação de demandas sem limite | Médio | Confirmado | Gabinete com base grande de demandas |
| 1.8 | Cron de demandas não atômico | Médio | Confirmado | Falha no meio do processamento em lote |
| 1.9 | Timezone em alterar-prazo | Baixo/Médio | Plausível | Depende de onde o valor é exibido |
| 2.1 | Falso positivo "conta órfã" | Baixo | Plausível | Janela de corrida muito estreita |

---

## 6. O que precisa ser feito na próxima sprint

**Prioridade 1 (dados já vazando ou já inconsistentes hoje, sem precisar de concorrência):**
1. Achado 1.5 — filtrar `deletedAt: null` no Banco de Talentos.
2. Achado 1.4 — alinhar `criar-demanda.ts` com `criar-demanda-com-cadastro.ts`.

**Prioridade 2 (risco estrutural silencioso, baixo custo de correção):**
3. Achado 1.1 — reaplicar RLS + políticas nos dois bancos, e criar o teste de CI que detecta divergência `relrowsecurity` vs. `pg_policies`. Mesmo com impacto zero hoje, esse é o tipo de gap que vira incidente crítico com uma única mudança de código futura despretensiosa.
4. Achados 1.2, 1.3, 1.6 — adicionar unique constraints faltantes (`AreaDemanda`, `Segmento`) e catch de P2002 onde a constraint já existe (`AreaColocacao`, `Gabinete` via `criar-gabinete.ts`/`editar-gabinete.ts`).

**Prioridade 3 (menor impacto, mas de baixo custo):**
5. Achados 1.7/1.8 — limite de exportação para demandas (paridade com pessoas) e tornar o cron de demandas atômico ou pelo menos idempotente/retomável.
6. Achado 1.9 — normalizar timezone no parsing de `novoPrazo`.
7. Achado 2.1 — re-check antes de reportar "conta órfã" em `criar-usuario-mobilizador.ts`.

Nenhuma correção foi aplicada nesta fase — esta é uma investigação pura, por decisão explícita do usuário ("eu faço a versão real agora"). O próximo passo natural, se aprovado, é repetir o padrão já usado nesta sessão: `/writing-plans` para transformar esta lista em um plano de implementação executável via subagent-driven-development.
