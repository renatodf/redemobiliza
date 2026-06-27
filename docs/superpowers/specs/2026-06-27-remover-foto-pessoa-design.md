# Design: Remover Foto de Perfil da Pessoa

**Data:** 2026-06-27
**Status:** Aprovado

---

## Objetivo

Permitir que admin ou a própria pessoa remova a foto de perfil existente, com confirmação inline antes da deleção.

---

## UI (FotoPerfilAvatar.tsx)

Exibição condicional: `canEdit && fotoUrl`

**Estado normal:**
```
[Alterar foto]  [Remover foto]
```

**Estado de confirmação** (após clicar "Remover foto"):
```
Confirmar remoção? [Sim] [Cancelar]
```

- "Remover foto": texto vermelho discreto (`text-xs text-red-500`)
- Durante remoção: opacidade reduzida + cursor-wait (mesmo padrão do upload)
- Após remoção bem-sucedida: `router.refresh()` — avatar volta ao placeholder

**Novo estado local:** `confirmandoRemocao: boolean`

---

## Server Action `removerFotoPessoa`

**Arquivo:** `src/actions/admin/remover-foto-pessoa.ts`

**Fluxo:**
1. Recebe `FormData` com `slug` e `pessoaId`
2. Valida presença dos parâmetros
3. `getUser()` — autentica
4. Carrega gabinete e pessoa
5. Verifica permissão: admin OU `pessoa.userId === user.id`
6. Se `pessoa.fotoUrl` existe: extrai path e deleta do storage `gabinete-assets`
7. `prisma.pessoa.update({ fotoUrl: null })`
8. `revalidatePath`

---

## Arquivos

| Arquivo | Ação |
|---|---|
| `src/actions/admin/remover-foto-pessoa.ts` | Criar |
| `src/app/[slug]/admin/pessoas/[pessoaId]/FotoPerfilAvatar.tsx` | Modificar |
