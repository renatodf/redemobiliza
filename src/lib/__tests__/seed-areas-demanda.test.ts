import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createMany } = vi.hoisted(() => {
  const createMany = vi.fn().mockResolvedValue({ count: 7 })
  return { createMany }
})

vi.mock('@/lib/prisma', () => ({
  prisma: { areaDemanda: { createMany } },
}))

import { seedAreasDemanda } from '@/lib/seed-areas-demanda'

describe('seedAreasDemanda', () => {
  beforeEach(() => createMany.mockClear())

  it('cria 7 áreas padrão para o gabinete', async () => {
    await seedAreasDemanda('gab-1')
    expect(createMany).toHaveBeenCalledOnce()
    const { data } = createMany.mock.calls[0][0]
    expect(data).toHaveLength(7)
    expect(data[0]).toEqual({ nome: 'Saúde', gabineteId: 'gab-1' })
  })

  it('usa skipDuplicates para ser idempotente', async () => {
    await seedAreasDemanda('gab-1')
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true)
  })
})
