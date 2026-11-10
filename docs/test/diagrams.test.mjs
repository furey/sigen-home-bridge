import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const docs = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, docs), 'utf8')
const diagramFile = (file) => new URL(`public/diagrams/${file}.svg`, docs)

const pageDiagramNames = () => readdirSync(new URL('reference/', docs))
  .filter((file) => file.endsWith('.md'))
  .flatMap((file) => [...read(`reference/${file}`).matchAll(/<Diagram name="([a-z-]+)"/g)])
  .map(([, name]) => name)

const deepDivePictures = () => [...read('DEEP_DIVE.md').matchAll(/<picture>[\s\S]*?<\/picture>/g)]
  .map(([picture]) => picture)

test('every docs diagram has a light and dark phone layout', () => {
  const names = pageDiagramNames()
  assert.ok(names.length > 0)
  names.forEach((name) => {
    assert.ok(existsSync(diagramFile(`${name}-phone-light`)), `${name}-phone-light.svg`)
    assert.ok(existsSync(diagramFile(`${name}-phone-dark`)), `${name}-phone-dark.svg`)
  })
})

test('the docs diagram component swaps to the phone layout on narrow screens', () => {
  const component = read('.vitepress/theme/Diagram.vue')
  assert.match(component, /sources\(`\$\{name\}-phone`\)/)
  assert.match(component, /@media \(max-width: 639px\)/)
})

test('every DEEP_DIVE diagram serves its phone layout first on narrow screens', () => {
  const pictures = deepDivePictures().filter((picture) => picture.includes('public/diagrams/'))
  assert.ok(pictures.length > 0)
  pictures.forEach((picture) => {
    const [, name] = picture.match(/public\/diagrams\/([a-z-]+?)-light\.svg" alt/)
    const sources = [...picture.matchAll(/<source media="([^"]+)" srcset="public\/diagrams\/([a-z-]+)\.svg">/g)]
      .map(([, media, file]) => [media, file])
    assert.deepEqual(sources, [
      ['(max-width: 639px) and (prefers-color-scheme: dark)', `${name}-phone-dark`],
      ['(max-width: 639px)', `${name}-phone-light`],
      ['(prefers-color-scheme: dark)', `${name}-dark`]
    ])
  })
})
