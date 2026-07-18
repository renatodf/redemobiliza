# Planilha Excel de backup da coleção `people` (MongoDB)

## Contexto

Um backup físico completo do MongoDB de produção (`meubancodedadosprod`) já foi
realizado em 18/07/2026 e está em
`/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/`
(dump `mongodump`, ~40 coleções em `.bson.gz`, verificado íntegro). Esse
backup é usado como fonte para o projeto de importação da base do Izalci
(`docs/superpowers/specs/2026-07-18-importacao-izalci-mongodb-design.md`),
mas esta tarefa é **independente** desse projeto: o usuário quer uma cópia de
segurança adicional, em formato Excel, da coleção principal de pessoas —
sem nenhuma relação com o mapeamento de campos ou o gabinete novo do Izalci.

## Objetivo

Gerar um arquivo `.xlsx` de leitura humana com os dados da coleção `people`
do dump, como backup redundante e independente do arquivo `.bson.gz`
original.

## Escopo

- **Apenas a coleção `people`** (142.916 documentos) — não as demais ~40
  coleções do dump (decisão do usuário: é o dado mais crítico e de maior
  volume; as outras ficam de fora desta tarefa).
- Uma aba única, uma linha por pessoa.
- Arquivo salvo em
  `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx`
  (mesma pasta do backup).

## Colunas

Todos os campos encontrados no dump viram coluna, sem descartar nenhum —
inclui os campos legados em português que aparecem em poucos registros
(`datanascimento`, `datanascimentoformatada`, `rua`, `numeroendereco`,
`complementoendereco`, `telefone`, `tagids`, `tags`) e os de baixa frequência
(`author_id`, `content`, `target_id`, `request_ids`, `photo`,
`photo_data`). Completude prevalece sobre limpeza, por ser um backup de
segurança.

Levantamento de campos existentes na coleção (nome → % dos documentos que o
têm), para referência:

```
_id 100.0%            surname 100.0%          created_at 100.0%
name 100.0%            updated_at 100.0%       tenant_id 100.0%
deleted 93.9%           tag_ids 93.5%            birth_date 81.1%
cep 79.3%               role 79.0%               created_by_id 78.9%
email 70.4%             _keywords 64.3%          people_created 64.3%
street_name 64.2%       coordinates 58.2%        cpf 49.4%
network_id 40.8%        neighborhood_label 38.2% city_label 37.5%
gender_id 32.0%         city_id 28.6%            electoral_zone 26.5%
electoral_section 26.5% observation_content 26.1% address_number 15.0%
address_complement 15.0% neighborhood_id 9.3%    gender_label 6.1%
religion_label 6.1%     phones_attributes 6.1%   observations_attributes 1.5%
religion_id 0.7%        photo_data 0.6%          complementoendereco 0.4%
datanascimento 0.4%     datanascimentoformatada 0.4% numeroendereco 0.4%
rua 0.4%                telefone 0.4%            tagids 0.4%
tags 0.4%               author_id 0.03%          content 0.03%
target_id 0.03%         request_ids 0.01%        photo 0.0007%
```

## Regras de conversão célula a célula

- **Ids** (`_id`, `created_by_id`, `network_id`, `tenant_id`,
  `neighborhood_id`, `city_id`, `gender_id`, `religion_id`, `author_id`,
  `target_id`, e os ids dentro de listas) → texto simples (string do
  ObjectId, sem tipo especial do Mongo).
- **Listas de valores simples** (ex. `tag_ids`, `request_ids`, `tags`,
  `tagids`, `_keywords`) → texto único separado por vírgula.
- **Listas de objetos** (`phones_attributes`, `observations_attributes`) →
  JSON compacto (`json.dumps` sem indentação) em texto na célula.
- **`coordinates`** (par `[long, lat]` no Mongo) → texto `"lat, long"`.
- **Datas** (`created_at`, `updated_at`, `birth_date`) → texto
  `AAAA-MM-DD HH:MM:SS`.
- **`birth_date` inválida** (sentinela fora do intervalo de data válido,
  ano 0001 — usado no dado de origem para "sem data de nascimento") →
  célula vazia, mesmo tratamento de campo ausente.
- **Campo ausente no documento** → célula vazia.
- **Booleans** (`deleted`) → `TRUE`/`FALSE` nativo do Excel.
- Demais campos escalares (texto/número) → valor direto, sem transformação.

## Implementação

Script Python de execução única (não faz parte do código do produto,
não entra em `src/`):

1. Descompactar `people.bson.gz` (já feito nesta sessão, arquivo temporário
   em scratchpad).
2. Decodificar com `bson.decode_file_iter`, `CodecOptions(datetime_conversion=
   DatetimeConversion.DATETIME_AUTO)` (necessário para não quebrar nos
   `birth_date` fora do intervalo válido de data).
3. Para cada documento, aplicar as regras de conversão acima e montar uma
   linha.
4. Escrever com `openpyxl` (a instalar via pip) em modo `write_only`/streaming,
   já que são ~142 mil linhas — evita carregar tudo em memória no objeto
   `Workbook`.
5. Cabeçalho = união de todas as chaves encontradas em todos os documentos,
   ordenada pela frequência levantada acima (colunas mais preenchidas
   primeiro).
6. Salvar em
   `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx`.

Sem testes automatizados (script de execução única, não faz parte do
produto) — validação é manual: conferir contagem de linhas (142.916 +
cabeçalho) e abrir o arquivo para checar uma amostra de registros contra o
JSON decodificado do Mongo.

## Fora de escopo

- As demais ~40 coleções do dump.
- Qualquer relação com o mapeamento de campos do projeto de importação do
  Izalci.
- Qualquer escrita de volta no MongoDB ou no Postgres/Supabase do produto.
