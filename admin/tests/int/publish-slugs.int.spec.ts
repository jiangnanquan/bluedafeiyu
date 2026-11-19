// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import { buildSiteDataTexts, exportSiteData } from '@/lib/export-site-data'
import { buildPublishSnapshot } from '@/lib/publish'

const work = (workId: string, status: string, slug?: string) => ({
  workId, status, slug, kind: 'submission', name: workId,
  character: { characterId: 'deepseek' }, categories: [], tags: [],
  createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z',
})

describe('发布时永久保留已分配的网址', () => {
  it('归档超过 2000 条后，发布快照仍保留旧作品和全部待发布记录', async () => {
    const works = Array.from({ length: 2000 }, (_, index) => work(`sticker_${index}`, 'published', `frozen-${index}`))
    const oldest = work('sticker_oldest', 'published', 'frozen-oldest')
    const pending = {
      ...work('sticker_pending', 'pending'),
      sha256: 'a'.repeat(64),
      submissionId: 'incoming',
      needsPublish: true,
    }
    const records = [...works, oldest, pending]
    const payload = {
      find: async (query: { collection: string; limit?: number; where?: unknown }) => {
        if (query.collection !== 'works') return { docs: [] }
        const matching = query.where ? [pending] : records
        return { docs: matching.slice(0, query.limit ?? matching.length) }
      },
    } as unknown as Payload

    const directExport = await exportSiteData(payload)
    const published = JSON.parse(directExport['data/works.json'])
    expect(published).toHaveLength(2001)
    expect(published).toContainEqual(expect.objectContaining({ id: oldest.workId, slug: oldest.slug }))

    const snapshot = await buildPublishSnapshot(payload, { runId: 'large-archive' })
    const exported = JSON.parse(snapshot.files['data/works.json'])
    expect(exported).toHaveLength(2002)
    expect(exported).toContainEqual(expect.objectContaining({ id: oldest.workId, slug: oldest.slug }))
    expect(exported).toContainEqual(expect.objectContaining({ id: pending.workId, status: 'published' }))
    expect(snapshot.originals).toMatchObject([{ workId: pending.workId }])
    expect(snapshot.versions[pending.workId]).toBe(pending.updatedAt)
    expect(snapshot.summary.added).toBe(1)
  })

  it('隐藏、移除和删除记录继续占用 slug，新作品编号跳过它们', () => {
    const retired = ['hidden', 'removed', 'deleted'].map((status, index) => work(`sticker_${status}`, status, `deepseek20261006000${index + 1}`))
    const texts = buildSiteDataTexts({ works: [...retired, work('sticker_new', 'pending')], characters: [], categories: [], topics: [], treatPendingAsPublished: true })
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-slugs-'))
    try {
      fs.mkdirSync(path.join(temp, 'tools'))
      fs.mkdirSync(path.join(temp, 'data'))
      fs.copyFileSync(path.resolve('..', 'tools/prepare_works.mjs'), path.join(temp, 'tools/prepare_works.mjs'))
      fs.writeFileSync(path.join(temp, 'data/works.json'), texts['data/works.json'])
      fs.writeFileSync(path.join(temp, 'data/owner-picks.json'), texts['data/owner-picks.json'])
      fs.writeFileSync(path.join(temp, 'data/blue-fish-classification.json'), '[]')
      fs.writeFileSync(path.join(temp, 'data/blue-fish-ids.json'), '{}')
      execFileSync(process.execPath, ['tools/prepare_works.mjs'], { cwd: temp })
      const records = JSON.parse(fs.readFileSync(path.join(temp, 'data/works.json'), 'utf8'))
      expect(records.find((record: any) => record.id === 'sticker_new').slug).toBe('deepseek202610060004')
      for (const original of retired) {
        expect(records.find((record: any) => record.id === original.workId)).toMatchObject({ slug: original.slug, status: original.status })
      }
      expect(records.filter((record: any) => record.status === 'published')).toHaveLength(1)
    } finally {
      fs.rmSync(temp, { recursive: true, force: true })
    }
  })

  it('不导出未发布且尚未分配网址的作品，也保留站长作品的隐藏记录', () => {
    const texts = buildSiteDataTexts({
      works: [work('pending', 'pending'), work('hidden_new', 'hidden'), { ...work('owner_hidden', 'hidden', 'owner-frozen'), kind: 'owner-picks' }],
      characters: [], categories: [], topics: [],
    })
    expect(JSON.parse(texts['data/works.json'])).toEqual([])
    expect(JSON.parse(texts['data/owner-picks.json'])).toMatchObject([{ id: 'owner_hidden', status: 'hidden', slug: 'owner-frozen' }])
  })
})
