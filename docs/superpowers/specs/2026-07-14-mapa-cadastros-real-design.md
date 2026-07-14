# Mapa real de pessoas cadastradas no Dashboard — design

> Spec gerada em 2026-07-14, a partir de brainstorming em texto, substituindo o design anterior
> do mapa do Dashboard (`docs/superpowers/specs/2026-07-13-mapa-regioes-dashboard-design.md`,
> seção "Fora de escopo": mapa real de tiles geográficos e suporte a estados fora do DF, ambos
> explicitamente descartados naquele momento — agora é exatamente o que o usuário pediu).

## Contexto e motivação

O mapa do Dashboard implementado em 13/07 (`MapaRegioesDF.tsx` + `src/lib/regioes-df-mapa.ts`)
é uma ilustração SVG estática, com uma tabela fixa das 33 Regiões Administrativas oficiais do
Distrito Federal (nome → contorno/posição aproximados). Ele não serve mais porque:

- **Cadastros da RIDE** (Região Integrada de Desenvolvimento do DF e Entorno) incluem pessoas de
  cidades de Goiás e Minas Gerais (ex: Águas Lindas de Goiás, Valparaíso de Goiás, Formosa,
  Unaí) — a Região dessas pessoas é cadastrada como texto livre e nunca vai bater com a tabela
  fixa de RAs do DF.
- **Gabinetes de outros estados**: o sistema é multi-tenant nacional, não só do DF. Um gabinete
  fora do DF não tem nenhuma RA que bata com a tabela — o mapa nunca mostra nada pra ele.

O pedido agora é um mapa geográfico real (tiles de verdade, não um desenho customizado), com um
pin por localidade que **tenha pelo menos uma pessoa cadastrada** — sem pin onde não há
cadastro — cobrindo qualquer cidade/região do Brasil, não só o DF.

Investigação prévia confirmou que hoje não existe nenhuma coordenada geográfica armazenada em
lugar nenhum do sistema: `Regiao` é só `{ nome, ativa }` por gabinete, e os campos de endereço em
`Pessoa` (`bairro`, `logradouro`, `cep`) são todos opcionais e majoritariamente vazios (a maioria
dos cadastros não passa pela etapa de endereço completo). Não dá pra geolocalizar por pessoa hoje
sem uma campanha de recadastro — por isso a granularidade escolhida é por Região (mesmo campo já
usado hoje na lista "Pessoas por região" e na Central de Filtros).

## Escopo

1. `Regiao` ganha `uf` (sigla do estado) e coordenadas (`latitude`/`longitude`) geocodificadas
   automaticamente a partir de `nome` + `uf`.
2. Tela de Cidades (`/[slug]/admin/configuracoes/cidades`) ganha campo de UF na criação e uma
   ação de editar (nome + UF) que hoje não existe — necessária pra permitir corrigir/completar
   regiões já cadastradas.
3. Novo componente de mapa real (Leaflet + tiles OpenStreetMap), substituindo por completo
   `MapaRegioesDF.tsx`, com um pin por Região que tenha coordenada **e** pelo menos uma pessoa
   cadastrada (`contagem > 0`).
4. Remoção total do código específico do DF (`regioes-df-mapa.ts`, `MapaRegioesDF.tsx`) e das
   mudanças não commitadas que estavam em andamento sobre ele (33 contornos de RA) — descartadas,
   não aproveitadas.

## Fora de escopo

- Geolocalização por pessoa individual (endereço/CEP) — granularidade é por Região, decisão
  explícita do usuário dado o baixo preenchimento de endereço completo hoje.
- Correção em massa (migration/backfill) de Regiões já cadastradas — elas simplesmente ficam sem
  pin até o admin abrir e salvar com UF preenchido. Sem job de fundo, sem geocodificação em lote.
- Edição de coordenada manual pelo admin (arrastar pin, digitar lat/lng à mão) — a coordenada é
  sempre resultado da geocodificação automática; se ela errar, a correção é ajustar nome/UF e
  salvar de novo (tenta geocodificar de novo).
- Mudança na Central de Filtros ou nas rotas de exportação — só a tela de Cidades e o Dashboard
  são afetados.
- Pan/zoom customizado por CSS transform (existia no mapa antigo) — o Leaflet já resolve pan/zoom
  nativamente sobre os tiles reais, não precisa de implementação própria.

## Modelo de dados

`prisma/schema.prisma`, model `Regiao`:

```
model Regiao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  uf         String?
  latitude   Float?
  longitude  Float?
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())
  ...
}
```

Todos os três campos novos são opcionais no schema (sem `NOT NULL`, sem migration de backfill).
`uf` é obrigatório na camada de UI/validação da action a partir de agora (formulário de criação e
edição), mas o schema permanece opcional pra não quebrar nenhuma Região já existente. Regiões
antigas simplesmente ficam com `uf`/`latitude`/`longitude` nulos até serem editadas.

## Geocodificação

### `src/lib/geocodificar-regiao.ts` (novo)

Função `geocodificarRegiao(nome: string, uf: string): Promise<{ latitude: number; longitude: number } | null>`:

- Chama `https://nominatim.openstreetmap.org/search?format=json&limit=1&q={nome}, {uf}, Brasil`,
  com header `User-Agent` identificando a aplicação (exigência de uso do Nominatim — requisições
  sem User-Agent identificável podem ser bloqueadas).
- Timeout curto (ex: 5s) via `AbortController` — se estourar, trata como "sem resultado".
- Resultado vazio, erro de rede, ou timeout: retorna `null` (chamador decide o que fazer — nunca
  lança exceção que travaria o salvamento da Região).
- Resultado encontrado: retorna `{ latitude, longitude }` a partir do primeiro item (`lat`/`lon`
  do payload do Nominatim, convertidos pra `number`).
- Chamada apenas nas actions `criarRegiao`/`editarRegiao` (ação manual do admin, uma Região por
  vez) — frequência naturalmente baixa, dentro da política de uso do Nominatim (máx. 1 req/s),
  sem necessidade de fila/rate-limit próprio.

### `src/actions/admin/criar-regiao.ts` (modificado)

- Novo campo obrigatório `uf` no `FormData` (validado: precisa ser uma das 27 siglas de estado
  brasileiras, ver `ESTADOS_BR` abaixo).
- Após criar a Região com `uf`, chama `geocodificarRegiao(nome, uf)`; se retornar coordenada,
  faz um segundo `update` gravando `latitude`/`longitude` (mantém a criação simples — a Região
  sempre é salva, com ou sem coordenada).

### `src/actions/admin/editar-regiao.ts` (novo)

- Recebe `regiaoId`, `nome`, `uf`. Reaproveita `assertAdminAccess` (mesmo padrão de
  `criarRegiao`), com verificação de tenant (`gabineteId` da Região bate com o gabinete da
  sessão) antes de qualquer update — mesmo padrão de defesa em profundidade já usado em todas as
  outras entidades do sistema.
- Se `nome` ou `uf` mudaram em relação ao valor salvo, roda `geocodificarRegiao` de novo e
  atualiza `latitude`/`longitude` (limpando pra `null` primeiro se a nova geocodificação falhar,
  pra não deixar uma coordenada desatualizada/errada associada ao nome novo).
- `revalidatePath` na tela de Cidades e no Dashboard (mesmo padrão das actions existentes).

### `src/lib/estados-br.ts` (novo)

Lista estática das 27 siglas de UF + nome por extenso (`{ sigla: 'DF', nome: 'Distrito Federal' }`,
etc.), usada tanto no `<select>` da tela de Cidades quanto na validação da action. Não existe
hoje no projeto — dado estático puro, sem necessidade de tabela no banco.

## Tela de Cidades

`src/app/[slug]/admin/configuracoes/cidades/page.tsx` (modificado):

- Formulário de criação ganha um `<select name="uf">` (opções de `ESTADOS_BR`, obrigatório) ao
  lado do campo de nome já existente.
- Cada item da lista ganha:
  - Um indicador visual de status da coordenada: bolinha verde + texto "no mapa" se
    `latitude`/`longitude` existirem; bolinha cinza + texto "sem localização" se não (seja por
    nunca ter sido editada, seja por geocodificação ter falhado).
  - Botão **Editar**, que abre `EditarCidadeDialog` (novo componente client, reaproveitando
    `src/components/admin/Modal.tsx` como as outras telas do admin) com campos nome/UF
    pré-preenchidos, submetendo pra `editarRegiao`.
- Botão **Desativar** existente não muda.

## Componente de mapa

### `src/lib/mapa-pessoas.ts` (novo, substitui `regioes-df-mapa.ts`)

Só a parte de `regioes-df-mapa.ts` que continua fazendo sentido: a função pura
`calcularTamanhoBalao(contagem: number, min: number, max: number): number`, migrada sem mudança
de lógica (clamp 17–34px já validado). Tudo relacionado a contorno/posição fixa do DF é removido,
não migrado.

### `src/components/MapaCadastros.tsx` (novo, substitui `MapaRegioesDF.tsx`)

Recebe a mesma lista que já alimenta a lista "Pessoas por região" hoje, estendida com
`uf`/`latitude`/`longitude`: `{ id, nome, contagem, href, latitude, longitude }[]`.

- `'use client'`, carregado via `next/dynamic` com `ssr: false` no componente pai
  (`DashboardConteudo.tsx`) — padrão necessário porque Leaflet acessa `window` diretamente e
  quebraria em SSR.
- Novas dependências: `leaflet`, `react-leaflet`, `@types/leaflet` (dev). Tiles do
  OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), gratuitos, sem chave de API.
- **Filtro do pin**: só entra no mapa quem tem `latitude`/`longitude` não-nulos **e**
  `contagem > 0`. Região sem coordenada ou com contagem zero não gera pin — sem exceção, sem
  fallback visual (o requisito é literal: "se não tem pessoa, não cria").
- Pin: `L.divIcon` com HTML/CSS próprio (bolha colorida com o número da contagem dentro,
  tamanho via `calcularTamanhoBalao`) — não o ícone padrão do Leaflet, que tem um bug conhecido
  de path de asset quebrado em bundlers como o do Next.js.
- Clique no pin usa o mesmo `href` que a lista já usa hoje (Central de Filtros filtrada por
  `regiaoId`) — comportamento idêntico ao mapa antigo.
- Viewport inicial: `map.fitBounds()` cobrindo todos os pins renderizados, com padding. Sem
  nenhum pin (nenhuma Região geocodada com gente cadastrada), cai num fallback fixo centrado no
  Brasil (`[-14.2, -51.9]`, zoom baixo).
- Container: mesma altura/posição já usada hoje na seção "Pessoas por região" (ao lado da lista,
  responsivo `flex-col` no mobile / `flex-row` no desktop).
- Atribuição "© OpenStreetMap contributors" permanece visível (comportamento padrão do
  `attributionControl` do Leaflet) — exigência de licença dos tiles e dos dados de geocodificação,
  não deve ser removida.

### `src/app/[slug]/admin/dashboard/DashboardConteudo.tsx` (modificado)

- Troca `MapaRegioesDF` por `MapaCadastros` (via `next/dynamic`), passando `uf`/`latitude`/
  `longitude` além dos campos que já iam antes.
- Nenhuma outra mudança de layout (a seção mapa+lista lado a lado já existe, só troca o
  componente do mapa).

### `src/app/[slug]/admin/dashboard/page.tsx` (modificado)

- `prisma.regiao.findMany` (query que já busca `id`/`nome`/`ativa`/contagem) passa a selecionar
  também `uf`, `latitude`, `longitude`.

## Código removido

- `src/lib/regioes-df-mapa.ts` — apagado por completo.
- `src/components/MapaRegioesDF.tsx` — apagado por completo.
- `src/lib/__tests__/regioes-df-mapa.test.ts` — apagado, substituído pelos testes novos listados
  abaixo.
- As mudanças não commitadas que estavam em andamento sobre esses arquivos (33 contornos reais de
  RA, ver histórico da sessão) são descartadas (`git checkout` nos arquivos afetados) antes de
  começar a implementação deste spec — não são aproveitadas em nada.

## Tratamento de erro / casos de borda

- **Geocodificação falha (nome não encontrado, erro de rede, timeout)**: Região é salva do mesmo
  jeito, sem coordenada. Tela de Cidades mostra "sem localização" nesse item. Sem erro pro admin,
  sem bloqueio de salvamento.
- **Região com coordenada mas contagem zero** (ninguém cadastrado ainda ali): não aparece no
  mapa — só na lista lateral, igual hoje.
- **Região desativada (`ativa: false`) com coordenada e contagem > 0**: continua gerando pin,
  mesmo comportamento de hoje na lista (aparece com o sufixo "(desativada)") — desativar uma
  Região não é o mecanismo pra tirá-la do mapa, só pra impedir que novos cadastros a usem.
- **Gabinete sem nenhuma Região geocodada**: mapa cai no fallback centrado no Brasil, sem pin
  nenhum. Lista lateral continua funcionando normalmente.
- **Editar nome ou UF de uma Região que já tinha coordenada**: geocodificação roda de novo; se a
  nova busca falhar, a coordenada antiga é limpa (não fica uma coordenada do nome/UF anterior
  associada ao nome novo).
- **Nominatim fora do ar / bloqueando a requisição**: mesmo tratamento de falha de geocodificação
  — Região salva sem coordenada, admin pode tentar editar de novo mais tarde.

## Testes

- `src/lib/__tests__/geocodificar-regiao.test.ts` (novo, TDD, mock de `fetch`): resultado
  encontrado (retorna lat/lng correto), sem resultado (retorna `null`), erro de rede (retorna
  `null`, não lança), timeout (retorna `null`, não lança).
- `src/lib/__tests__/mapa-pessoas.test.ts` (migração direta dos casos já existentes de
  `calcularTamanhoBalao` em `regioes-df-mapa.test.ts` — mesmo comportamento, arquivo renomeado).
- `src/actions/admin/__tests__/criar-regiao.test.ts` (modificado) e
  `src/actions/admin/__tests__/editar-regiao.test.ts` (novo): validação de UF obrigatório/inválido,
  chamada de geocodificação com nome+UF corretos, Região salva mesmo quando geocodificação
  retorna `null`, tenant check em `editarRegiao` (não deixa editar Região de outro gabinete).
- Sem teste automatizado do componente de mapa em si (`MapaCadastros.tsx`) — mesmo padrão já
  aceito no projeto pra componentes visuais (`GraficoPizza` também não tem).
- Verificação manual (gabinete real, dado real):
  - Criar uma Região nova com nome de cidade real + UF, confirmar que aparece pin no mapa depois
    de ter pelo menos uma pessoa vinculada.
  - Editar uma Região existente pra adicionar UF, confirmar que o pin passa a aparecer.
  - Região com nome que a geocodificação não acha (ex: nome inventado): confirmar que salva sem
    erro e mostra "sem localização" na tela de Cidades.
  - Clicar num pin abre a Central de Filtros com o filtro de região certo.
  - Cadastrar uma Região de cidade da RIDE (GO ou MG) e confirmar que o pin aparece na posição
    geográfica correta, fora do contorno do DF.
