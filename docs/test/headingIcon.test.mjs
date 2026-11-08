import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMarkdownRenderer } from 'vitepress'
import { headingIcon } from '../.vitepress/headingIcon.mjs'

const md = await createMarkdownRenderer('.', { config: headingIcon })
const render = (source, frontmatter = {}) => md.render(source, { frontmatter })

test('puts the frontmatter icon at the start of the page H1', () => {
  const html = render('# Apple Home', { icon: 'house' })
  assert.match(html, /<h1[^>]*><HeadingIcon name="house" \/>Apple Home/)
})

test('keeps the H1 anchor slug unchanged', () => {
  assert.match(render('# Apple Home', { icon: 'house' }), /<h1 id="apple-home"/)
})

test('leaves H2 headings alone', () => {
  const html = render('# Trends\n\n## Periods', { icon: 'chart-spline' })
  assert.doesNotMatch(html, /<h2[^>]*><HeadingIcon/)
})

test('adds nothing without an icon', () => {
  assert.doesNotMatch(render('# Alerts'), /HeadingIcon/)
})

test('ignores an icon name that is not a plain slug', () => {
  assert.doesNotMatch(render('# Alerts', { icon: '"><script>' }), /HeadingIcon|<script>/)
})
