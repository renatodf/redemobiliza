# Combobox de Segmentos no Link de Cadastro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o grid de pills sempre-visível de Segmentos em `GerarLinkForm.tsx` (tela `/[slug]/admin/link-cadastro`) por um combobox digitável + filtro, reaproveitando o componente `ComboBoxMultiplo` já usado no filtro de Banco de Talentos.

**Architecture:** Mudança de UI pura em um único arquivo cliente (`'use client'`). Sem novo componente, sem nova lib, sem mudança de Server Action, schema ou rota — `ComboBoxMultiplo` (`src/components/admin/ComboBoxMultiplo.tsx`) e `filtrarOpcoesComboBox` (`src/lib/filtrar-opcoes-combobox.ts`) já existem e já são usados em produção em `src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx`.

**Tech Stack:** Next.js 14 (App Router) + React 18 + TypeScript 5 + Tailwind 3.4.

## Global Constraints

- Nenhuma mudança na Server Action `gerarLinkCadastro` nem no formato de dado enviado (`segmentoIds` continua uma lista de ids via `<input type="hidden" name="segmentoIds">`).
- Nenhuma mudança em `ComboBoxMultiplo`/`filtrarOpcoesComboBox` — usar como já existem.
- O seletor de Mobilizador/Rede (`<select name="mobilizadorPessoaId">`) permanece inalterado — fora de escopo (decisão do usuário no brainstorming).
- Manter o estilo de cor dinâmica do gabinete (`corPrimaria`/`corTexto`) já usado hoje nas pills selecionadas.

Spec completo: `docs/superpowers/specs/2026-07-19-link-cadastro-combobox-segmentos-design.md`.

---

### Task 1: Trocar o grid de Segmentos pelo ComboBoxMultiplo

**Files:**
- Modify: `src/app/[slug]/admin/link-cadastro/GerarLinkForm.tsx`

**Interfaces:**
- Consumes: `ComboBoxMultiplo` de `@/components/admin/ComboBoxMultiplo` — props `opcoes: {id: string; label: string}[]`, `selecionados: Set<string>`, `onToggle: (id: string) => void`, `placeholder: string`. Estado local já existente no arquivo: `segmentosSelecionados: Set<string>` e função `toggleSegmento(id: string)` (linhas 40, 43-50 do arquivo atual) — não mudam.
- Produces: nada consumido por outro arquivo — mudança isolada a este componente.

Não há lógica pura nova para TDD nesta task (é composição de dois componentes/hooks já existentes e testados). A verificação é manual (Step 4).

- [ ] **Step 1: Adicionar o import do `ComboBoxMultiplo`**

No topo de `src/app/[slug]/admin/link-cadastro/GerarLinkForm.tsx`, logo após o import de `corTextoContraste` (linha 6 atual):

```tsx
import { corTextoContraste } from '@/lib/cor-contraste'
import { ComboBoxMultiplo } from '@/components/admin/ComboBoxMultiplo'
```

- [ ] **Step 2: Substituir o bloco de Segmentos**

Localizar este bloco (linhas 67-90 do arquivo atual):

```tsx
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Segmentos para esse cadastro</p>
          <div className="flex flex-wrap gap-2">
            {segmentos.map((seg) => {
              const selecionado = segmentosSelecionados.has(seg.id)
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => toggleSegmento(seg.id)}
                  style={selecionado ? { backgroundColor: corPrimaria, color: corTexto } : undefined}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    selecionado ? '' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {seg.nome}
                </button>
              )
            })}
            {segmentos.length === 0 && (
              <p className="text-xs text-gray-500">Nenhum segmento ativo cadastrado.</p>
            )}
          </div>
        </div>
```

E substituir por:

```tsx
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Segmentos para esse cadastro</p>
          {segmentos.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhum segmento ativo cadastrado.</p>
          ) : (
            <>
              <ComboBoxMultiplo
                opcoes={segmentos.map((seg) => ({ id: seg.id, label: seg.nome }))}
                selecionados={segmentosSelecionados}
                onToggle={toggleSegmento}
                placeholder="Buscar segmento..."
              />
              {segmentosSelecionados.size > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {segmentos
                    .filter((seg) => segmentosSelecionados.has(seg.id))
                    .map((seg) => (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => toggleSegmento(seg.id)}
                        style={{ backgroundColor: corPrimaria, color: corTexto }}
                        className="px-3 py-1.5 rounded-md text-xs font-medium"
                      >
                        {seg.nome}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
```

O resto do arquivo (o `<input type="hidden" name="segmentoIds">` gerado a partir de `segmentosSelecionados` nas linhas 63-65, o `<select>` de Mobilizador, o botão Gerar, a seção de link/QR code gerados) não muda.

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `GerarLinkForm.tsx` (o projeto pode já ter avisos pré-existentes em outros arquivos — só checar que este arquivo não introduz nenhum).

- [ ] **Step 4: Verificação manual no navegador**

```bash
npm run dev
```

Acessar `http://localhost:3000/<slug>/admin/link-cadastro` (usar um gabinete de teste com vários Segmentos cadastrados, ex. `amigos-do-izalci` ou `izalci`) logado como admin. Confirmar:
1. O campo de busca digitável aparece no lugar do grid de pills antigo, com placeholder "Buscar segmento...".
2. Digitar parte do nome de um segmento filtra a lista do dropdown.
3. Clicar numa opção do dropdown: ela some da lista de opções e vira uma pill colorida (cor do gabinete) abaixo do combobox; o campo de busca limpa e o dropdown fecha.
4. Clicar numa pill selecionada remove ela da lista de selecionados (some a pill, a opção volta a aparecer no dropdown ao digitar).
5. Gerar o link com 1+ segmento selecionado e conferir que a URL gerada contém os `segmentos=` esperados (mesmo comportamento de antes).
6. Testar com um gabinete sem nenhum Segmento cadastrado (ou zerar segmentos de teste): confirma que aparece só a mensagem "Nenhum segmento ativo cadastrado." sem renderizar o combobox.
7. Sem erros no console do navegador.

- [ ] **Step 5: Commit**

```bash
git add src/app/\[slug\]/admin/link-cadastro/GerarLinkForm.tsx
git commit -m "$(cat <<'EOF'
feat: combobox digitável para Segmentos no Link de Cadastro

Reaproveita o ComboBoxMultiplo já usado no filtro de Banco de
Talentos, substituindo o grid de pills sempre-visível que ficava
grande demais para escanear em gabinetes com muitos Segmentos.
EOF
)"
```

---

## Self-Review

**Spec coverage:** A spec (`docs/superpowers/specs/2026-07-19-link-cadastro-combobox-segmentos-design.md`) descreve uma única mudança — trocar o grid de pills de Segmentos pelo `ComboBoxMultiplo` em `GerarLinkForm.tsx`, mantendo pills de selecionados abaixo, mantendo `segmentoIds` inalterado, mantendo o `<select>` de Mobilizador fora de escopo. Task 1 cobre os quatro pontos integralmente.

**Placeholder scan:** Nenhum "TBD"/"implementar depois" — todo código é completo e literal, copiável direto.

**Type consistency:** `opcoes: {id, label}[]`, `selecionados: Set<string>`, `onToggle: (id: string) => void` batem exatamente com a assinatura de `ComboBoxMultiplo` (`src/components/admin/ComboBoxMultiplo.tsx`, já lido). `segmentosSelecionados`/`toggleSegmento` reaproveitados sem alteração de tipo do estado já existente no arquivo.
