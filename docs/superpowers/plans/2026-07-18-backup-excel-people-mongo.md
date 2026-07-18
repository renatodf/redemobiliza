# Planilha Excel de backup da coleção `people` (MongoDB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx`, uma cópia de leitura humana em Excel da coleção `people` do backup MongoDB já existente (142.916 documentos), como backup redundante e independente do `.bson.gz` original.

**Architecture:** Um único script Python de execução única (fora do código de produto, não entra em `src/`, não é commitado no git) que: (1) decodifica `people.bson.gz` direto via `bson.decode_file_iter` sobre o stream gzip, (2) converte cada documento numa linha seguindo as regras de conversão da spec, (3) escreve num `.xlsx` em modo streaming (`openpyxl.Workbook(write_only=True)`) para não estourar memória com 142 mil linhas.

**Tech Stack:** Python 3.8, pacote `bson` (já instalado nesta sessão via `pip3 install pymongo`), `openpyxl` (a instalar).

## Global Constraints

- Fonte: `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/people.bson.gz` (142.916 documentos).
- Destino: `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx`, uma aba, uma linha por pessoa.
- Escopo: só a coleção `people` — nenhuma outra coleção do dump.
- Sem testes automatizados (script de execução única) — validação é manual (contagem de linhas + amostra conferida contra o documento decodificado).
- Script não é commitado no git (fora do código de produto) — vive em `/private/tmp/claude-501/-Users-renato-Documents-meubd/a1675b12-f51b-462d-aefc-50c6b1615832/scratchpad/`.
- Todas as regras de conversão de campo abaixo vêm de `docs/superpowers/specs/2026-07-18-backup-excel-people-mongo-design.md` e devem ser seguidas exatamente.

---

### Task 1: Gerar e validar a planilha Excel de `people`

**Files:**
- Create: `/private/tmp/claude-501/-Users-renato-Documents-meubd/a1675b12-f51b-462d-aefc-50c6b1615832/scratchpad/export_people_to_excel.py`
- Create (output, não é código): `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx`

**Interfaces:**
- Consumes: nada de tasks anteriores (task única).
- Produces: o arquivo `.xlsx` final, consumido diretamente pelo usuário no Excel — não há tasks seguintes.

- [ ] **Step 1: Instalar `openpyxl`**

Run: `pip3 install --quiet openpyxl`
Expected: sem erro (o comando pode emitir só o aviso de versão do pip, que é inofensivo).

- [ ] **Step 2: Escrever o script de conversão**

Criar `/private/tmp/claude-501/-Users-renato-Documents-meubd/a1675b12-f51b-462d-aefc-50c6b1615832/scratchpad/export_people_to_excel.py` com o conteúdo abaixo:

```python
import gzip
import json
import datetime

import bson
from bson.codec_options import CodecOptions, DatetimeConversion
from openpyxl import Workbook

SRC = "/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/people.bson.gz"
DEST = "/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx"

# Ordem de colunas: todas as chaves observadas na coleção "people",
# da mais frequente para a menos frequente (ver spec).
FIELDS = [
    "_id", "name", "surname", "created_at", "updated_at", "tenant_id",
    "deleted", "tag_ids", "birth_date", "cep", "role", "created_by_id",
    "email", "_keywords", "people_created", "street_name", "coordinates",
    "cpf", "network_id", "neighborhood_label", "city_label", "gender_id",
    "city_id", "electoral_zone", "electoral_section", "observation_content",
    "address_number", "address_complement", "neighborhood_id",
    "gender_label", "religion_label", "phones_attributes",
    "observations_attributes", "religion_id", "photo_data",
    "complementoendereco", "datanascimento", "datanascimentoformatada",
    "numeroendereco", "rua", "telefone", "tagids", "tags", "author_id",
    "content", "target_id", "request_ids", "photo",
]

ID_FIELDS = {
    "_id", "created_by_id", "network_id", "tenant_id", "neighborhood_id",
    "city_id", "gender_id", "religion_id", "author_id", "target_id",
}
LIST_SIMPLE_FIELDS = {"tag_ids", "request_ids", "tags", "tagids", "_keywords"}
LIST_OBJECT_FIELDS = {"phones_attributes", "observations_attributes"}
DATE_FIELDS = {"created_at", "updated_at", "birth_date"}
BOOL_FIELDS = {"deleted"}


def convert_value(field, value):
    if value is None:
        return None
    if field in ID_FIELDS:
        return str(value)
    if field in LIST_SIMPLE_FIELDS:
        if not isinstance(value, (list, tuple)):
            return str(value)
        return ", ".join(str(v) for v in value)
    if field in LIST_OBJECT_FIELDS:
        return json.dumps(value, ensure_ascii=False, default=str)
    if field == "coordinates":
        if isinstance(value, (list, tuple)) and len(value) == 2:
            lon, lat = value
            return f"{lat}, {lon}"
        return json.dumps(value, ensure_ascii=False, default=str)
    if field in DATE_FIELDS:
        if isinstance(value, datetime.datetime):
            return value.strftime("%Y-%m-%d %H:%M:%S")
        return None
    if field in BOOL_FIELDS:
        return bool(value)
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def main():
    opts = CodecOptions(datetime_conversion=DatetimeConversion.DATETIME_AUTO)
    wb = Workbook(write_only=True)
    ws = wb.create_sheet("people")
    ws.append(FIELDS)

    count = 0
    with gzip.open(SRC, "rb") as f:
        for doc in bson.decode_file_iter(f, codec_options=opts):
            row = [convert_value(field, doc.get(field)) for field in FIELDS]
            ws.append(row)
            count += 1

    wb.save(DEST)
    print(f"Linhas de dados escritas: {count}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Rodar o script**

Run: `python3 /private/tmp/claude-501/-Users-renato-Documents-meubd/a1675b12-f51b-462d-aefc-50c6b1615832/scratchpad/export_people_to_excel.py`
Expected: imprime `Linhas de dados escritas: 142916` e cria o arquivo `/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx`.

- [ ] **Step 4: Validar contagem de linhas no arquivo gerado**

```python
from openpyxl import load_workbook
wb = load_workbook(
    "/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx",
    read_only=True,
)
ws = wb["people"]
print(ws.max_row)  # esperado: 142917 (142916 + 1 linha de cabeçalho)
```

Run: cole o snippet acima num `python3 -c "..."` ou script temporário.
Expected: `142917`.

- [ ] **Step 5: Validar uma amostra contra o dado original**

```python
import gzip
import bson
from bson.codec_options import CodecOptions, DatetimeConversion
from openpyxl import load_workbook

SRC = "/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/meubancodedadosprod/people.bson.gz"
DEST = "/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx"

opts = CodecOptions(datetime_conversion=DatetimeConversion.DATETIME_AUTO)
with gzip.open(SRC, "rb") as f:
    first_doc = next(bson.decode_file_iter(f, codec_options=opts))

wb = load_workbook(DEST, read_only=True)
ws = wb["people"]
rows = ws.iter_rows(values_only=True)
header = next(rows)
first_row = next(rows)
row_dict = dict(zip(header, first_row))

assert row_dict["_id"] == str(first_doc["_id"]), (row_dict["_id"], first_doc["_id"])
assert row_dict["name"] == first_doc["name"]
assert row_dict["surname"] == first_doc["surname"]
print("OK — primeira linha da planilha bate com o primeiro documento do dump")
```

Run: cole o snippet acima num `python3 -c "..."` ou script temporário.
Expected: `OK — primeira linha da planilha bate com o primeiro documento do dump` (sem `AssertionError`).

- [ ] **Step 6: Reportar ao usuário**

Sem commit (script fora do código de produto). Confirmar ao usuário o caminho final do arquivo:
`/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/people-2026-07-18.xlsx`, a contagem de linhas validada, e que a amostra bateu.
