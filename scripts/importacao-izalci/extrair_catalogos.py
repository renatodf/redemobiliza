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
    "Acao social": "Ação social",
    "Ação social .": "Ação social",
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
