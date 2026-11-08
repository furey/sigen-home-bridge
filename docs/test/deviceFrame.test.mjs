import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMarkdownRenderer } from 'vitepress'
import { deviceFrame } from '../.vitepress/deviceFrame.mjs'

const md = await createMarkdownRenderer('.', { config: deviceFrame })
const render = (source) => md.render(source, { frontmatter: {} })

test('wraps a full-screen app screenshot in a device frame', () => {
  const html = render('![The dashboard](../screenshots/dashboard-tablet.png)')
  assert.match(html, /<span class="device-frame"><span class="device-frame__screen"><img[^>]*dashboard-tablet\.png[^>]*><\/span><\/span>/)
})

test('keeps the alt text on the framed image', () => {
  assert.match(render('![The dashboard](../screenshots/dashboard-tablet.png)'), /alt="The dashboard"/)
})

test('leaves cropped screenshots unframed', () => {
  assert.doesNotMatch(render('![Settings, Apple Home section](../screenshots/settings-apple-home.png)'), /device-frame/)
  assert.doesNotMatch(render('![The setup wizard](../screenshots/wizard-gateway.png)'), /device-frame/)
  assert.doesNotMatch(render('![The Device Breakdown page](../screenshots/devices-desktop.png)'), /device-frame/)
  assert.doesNotMatch(render('![The dashboard](../screenshots/dashboard-desktop.png)'), /device-frame/)
})

test('leaves other images unframed', () => {
  assert.doesNotMatch(render('![Logo](/logo.svg)'), /device-frame/)
})
