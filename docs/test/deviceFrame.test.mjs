import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMarkdownRenderer } from 'vitepress'
import { deviceFrame } from '../.vitepress/deviceFrame.mjs'

const md = await createMarkdownRenderer('.', { config: deviceFrame })
const render = (source) => md.render(source, { frontmatter: {} })

test('wraps an app screenshot in a device frame', () => {
  const html = render('![The dashboard](../screenshots/dashboard-desktop.png)')
  assert.match(html, /<span class="device-frame"><span class="device-frame__screen"><img[^>]*dashboard-desktop\.png[^>]*><\/span><\/span>/)
})

test('keeps the alt text on the framed image', () => {
  assert.match(render('![The dashboard](../screenshots/dashboard-desktop.png)'), /alt="The dashboard"/)
})

test('leaves other images unframed', () => {
  assert.doesNotMatch(render('![Logo](/logo.svg)'), /device-frame/)
})
