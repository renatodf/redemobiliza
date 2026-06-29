# Design: Ordenação, Colunas de Rede e Navegação em Cascata

**Data:** 2026-06-28  
**Status:** Aprovado

---

## Escopo

Ajustes na listagem de pessoas do sistema:
1. Ordenação alfabética por nome (3 estados)
2. Novas colunas: Redes e Cadastros nas redes
3. Navegação em cascata pela árvore da rede com breadcrumb
4. Acesso ao perfil completo ao clicar no nome
5. Zeros exibidos como "—"

Telas afetadas: admin `/pessoas`, mobilizador (seção convidados + nova rota `/rede`).

---

## 1. Ordenação por Nome

### Comportamento
- Três estados, ciclados por clique no cabeçalho "Nome":
  1. Padrão (sem param) → `criadoEm desc` — ícone ↕
  2. `?sort=nome&order=asc` → A→Z — ícone ↑
  3. `?sort=nome&order=desc` → Z→A — ícone ↓
- Clique no estado ↓ retorna ao padrão (remove os params de sort)

### Implementação
- `SortableHeader` — client component que lê os search params atuais e faz `router.push(novaUrl)` ao clicar. Recebe `label`, `field` e os params atuais como props.
- A page server component lê `searchParams.sort` e `searchParams.order` e passa o `orderBy` correto ao Prisma.
- Aplicado: admin pessoas page + lista de convidados do mobilizador (via rota `/mobilizador/rede`).

---

## 2. Novas Colunas: Redes e Cadastros nas Redes

### Definições
- **Redes**: quantidade de pessoas diretamente mobilizadas por esse perfil = `count(VinculoRede where indicadoPorId = pessoa.id AND deletedAt IS NULL)`
- **Cadastros nas redes**: soma das "Redes" de cada mobilizador diretamente vinculado a esse perfil = `sum(Redes(m) for m in mobilizadores_diretos(pessoa))`
- Valor zero exibido como `—` (em ambas as colunas)
- Visível para todos os perfis (Super Admin, Admin, Mobilizador)

### Posição na tabela
`Nome | WhatsApp | Região | Redes | Cadastros nas redes | Colaborador | Mobilizador`

### Query Prisma
A query de pessoas inclui:
```ts
select: {
  // campos existentes...
  _count: { select: { redesComoIndicador: { where: { deletedAt: null } } } },
  redesComoIndicador: {
    where: { deletedAt: null },
    select: {
      pessoa: {
        select: {
          _count: { select: { redesComoIndicador: { where: { deletedAt: null } } } }
        }
      }
    }
  }
}
```

Pós-processamento em TypeScript:
```ts
const totalCadastros = pessoa.redesComoIndicador.reduce(
  (acc, v) => acc + v.pessoa._count.redesComoIndicador,
  0
)
```

Isso evita raw SQL e é viável com o limite de 50 registros por página.

---

## 3. Navegação em Cascata

### Mecanismo: URL params na mesma rota

Para admin:
```
/[slug]/admin/pessoas                           → lista todos
/[slug]/admin/pessoas?rede=ID_A&path=ID_A       → rede de A
/[slug]/admin/pessoas?rede=ID_B&path=ID_A,ID_B  → rede de B (via A)
```

Para mobilizador (rota dedicada para não recarregar QR codes e perfil):
```
/[slug]/mobilizador/rede?rede=ID_A&path=ID_A
/[slug]/mobilizador/rede?rede=ID_B&path=ID_A,ID_B
```

### Gatilhos de navegação
Qualquer um dos três abre a rede da pessoa:
- Clique no número da coluna **Redes**
- Clique no número da coluna **Cadastros nas redes**
- Clique no badge **Mobilizador** (roxo)

Todos renderizam como `<Link href={urlRede}>`. Se o valor for `—` (zero), o elemento não é clicável.

### Breadcrumb
- Renderizado no topo da lista quando `?rede` está presente
- Busca nomes de todos os IDs do `path` com `prisma.pessoa.findMany({ where: { id: { in: pathIds } } })`
- Formato: `Pessoas → Rede de João → Rede de Maria`
- "Pessoas" linka para a rota raiz (sem params)
- Cada nome linka para `?rede=ID&path=ID_1,...,ID_n` (path truncado até aquele nível)

### Filtragem ao navegar
Quando `?rede=pessoaId` está presente:
1. Busca `VinculoRede where indicadoPorId = pessoaId AND deletedAt IS NULL` → obtém os IDs das pessoas da rede
2. Faz `Pessoa.findMany where id IN [ids]` com as mesmas colunas, ordenação e paginação

### Permissões
| Perfil | Pode navegar em |
|---|---|
| Super Admin | Toda a árvore do sistema |
| Admin | Toda a árvore do seu gabinete |
| Mobilizador | Apenas sua própria rede e níveis abaixo |

Para o mobilizador: a navegação parte sempre de sua própria rota `/mobilizador/rede`. O `?rede` param só pode ser um ID que já pertença à sub-árvore do mobilizador logado — verificado filtrando `VinculoRede where indicadoPorId = redeParam AND gabineteId = gabinete.id`. Como a navegação só parte de IDs visíveis na própria rede do mobilizador, a verificação é implícita.

---

## 4. Acesso ao Perfil Completo

- **Admin / Super Admin**: clique no nome → `/[slug]/admin/pessoas/[pessoaId]` (rota já existente)
- **Mobilizador**: clique no nome → `/[slug]/mobilizador/pessoas/[pessoaId]` (nova rota)

A nova rota do mobilizador exibe:
- Dados cadastrais completos (nome, whatsapp, email, região, profissão, gênero, foto)
- Observações
- Histórico de demandas

Permissão: apenas pessoas cujo `VinculoRede.indicadoPorId` pertença à sub-árvore do mobilizador logado (verificação direta no `findFirst` com filtro por `gabineteId`).

---

## 5. Zero como "—"

Em todas as telas que listam pessoas, quando `Redes === 0` exibir `—`, quando `Cadastros nas redes === 0` exibir `—`. Elemento não é clicável nesses casos.

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---|---|
| `src/components/SortableHeader.tsx` | Criar — client component para cabeçalho ordenável |
| `src/app/[slug]/admin/pessoas/page.tsx` | Modificar — ordenação, novas colunas, cascata, breadcrumb |
| `src/app/[slug]/mobilizador/page.tsx` | Modificar — seção "Pessoas convidadas" exibe contagem + botão "Ver minha rede" → `/mobilizador/rede` (evita recarregar QR codes a cada drill-down) |
| `src/app/[slug]/mobilizador/rede/page.tsx` | Criar — listagem com tabela completa, cascata e breadcrumb |
| `src/app/[slug]/mobilizador/pessoas/[pessoaId]/page.tsx` | Criar — perfil read-only para mobilizador |

---

## O Que Não Muda

- Paginação (mantém `take: 50` existente)
- Formulário de cadastro manual (permanece no topo da página admin)
- Rota de perfil do admin (`/admin/pessoas/[pessoaId]`) — sem alterações
- Layout e autenticação das rotas existentes
