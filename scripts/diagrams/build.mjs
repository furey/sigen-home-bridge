import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../../docs/public/diagrams/', import.meta.url))
const ICONS = JSON.parse(readFileSync(new URL('./lucide-icons.json', import.meta.url), 'utf8'))

export const buildDiagrams = (only) => {
  mkdirSync(OUT, { recursive: true })
  Object.entries(diagrams)
    .filter(([name]) => !only || only.includes(name))
    .forEach(([name, draw]) => {
      Object.entries(themes).forEach(([themeName, theme]) => {
        writeFileSync(`${OUT}${name}-${themeName}.svg`, svg({ ...draw(theme), theme }))
      })
    })
}

const themes = {
  light: {
    text: '#3c3c43', muted: '#67676c', faint: '#929295', line: '#a8a8ae', panel: '#f6f6f7',
    tile: 'rgba(142, 150, 170, 0.14)', page: '#ffffff',
    tones: {
      amber: '#b45309', sky: '#0369a1', fuchsia: '#a21caf', cyan: '#0e7490', orange: '#c2410c',
      indigo: '#4338ca', violet: '#6d28d9', green: '#15803d', blue: '#1d4ed8', rose: '#be123c',
      neutral: '#67676c'
    }
  },
  dark: {
    text: '#dfdfd6', muted: '#98989f', faint: '#6a6a71', line: '#5c5c63', panel: '#202127',
    tile: 'rgba(101, 117, 133, 0.16)', page: '#1b1b1f',
    tones: {
      amber: '#fbbf24', sky: '#38bdf8', fuchsia: '#e879f9', cyan: '#67e8f9', orange: '#fb923c',
      indigo: '#818cf8', violet: '#a78bfa', green: '#4ade80', blue: '#60a5fa', rose: '#fb7185',
      neutral: '#98989f'
    }
  }
}

const architecture = (t) => {
  const outputs = [
    { x: 100, icon: 'house', tone: 'fuchsia', title: 'Apple Home', sub: ['iPhone, iPad,', 'HomePod'] },
    { x: 260, icon: 'layout-dashboard', tone: 'amber', title: 'Dashboard', sub: ['any browser,', 'live updates'] },
    { x: 420, icon: 'braces', tone: 'orange', title: 'JSON API', sub: ['scripts,', 'Home Assistant'] },
    { x: 580, icon: 'cloud', tone: 'cyan', title: 'Google Home', sub: ['through Cloudflare', 'Tunnel'], internet: true }
  ]
  const panel = { x: 60, y: 196, w: 560, h: 150 }
  const fanY = panel.y + panel.h
  const outY = 444
  return {
    width: 680,
    height: 650,
    body: [
      endpoint({ x: 230, y: 40, icon: 'battery-charging', tone: 'sky', title: 'Sigenergy gateway', sub: ['solar, battery, grid'] }, t),
      endpoint({ x: 470, y: 40, icon: 'thermometer-sun', tone: 'neutral', title: 'Open-Meteo', sub: ['outdoor temperature,', 'located by IP'] }, t),
      link({ d: `M230 140 V${panel.y - 4}`, t, arrow: true }),
      note({ x: 242, y: 172, text: 'Modbus TCP, read only', t, anchor: 'start' }),
      link({ d: `M470 164 V${panel.y - 4}`, t, dashed: true, arrow: true }),
      `<rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="18" fill="${t.panel}"/>`,
      text({ x: panel.x + 28, y: panel.y + 40, text: 'sigen-home-bridge', size: 17, weight: 650, fill: t.text, anchor: 'start' }),
      text({ x: panel.x + 28, y: panel.y + 62, text: 'one Docker container on your home network', size: 13, fill: t.muted, anchor: 'start' }),
      fact({ x: panel.x + 28, y: panel.y + 104, icon: 'timer', title: 'Reads every 5 s', sub: 'or on your schedule', t }),
      fact({ x: panel.x + 208, y: panel.y + 104, icon: 'clock', title: 'Keeps history', sub: 'SQLite, 31 to 90 days', t }),
      fact({ x: panel.x + 388, y: panel.y + 104, icon: 'layers', title: 'Saves settings', sub: 'settings.json', t }),
      ...outputs.map((o) => link({
        d: `M340 ${fanY} C340 ${fanY + 46} ${o.x} ${outY - 50} ${o.x} ${outY - 4}`,
        t,
        dashed: o.internet,
        arrow: true
      })),
      ...outputs.map((o) => endpoint({ ...o, y: outY }, t)),
      legend({ x: 340, y: 618, t })
    ]
  }
}

const endpoint = ({ x, y, icon, tone, title, sub = [] }, t) => [
  `<rect x="${x - 26}" y="${y}" width="52" height="52" rx="12" fill="${t.tile}"/>`,
  iconAt({ name: icon, x: x - 13, y: y + 13, size: 26, colour: t.tones[tone] }),
  text({ x, y: y + 78, text: title, size: 15, weight: 600, fill: t.text }),
  ...sub.map((line, i) => text({ x, y: y + 98 + i * 17, text: line, size: 13, fill: t.muted }))
].join('')

const fact = ({ x, y, icon, title, sub, t }) => [
  iconAt({ name: icon, x, y: y - 14, size: 18, colour: t.muted }),
  text({ x: x + 28, y, text: title, size: 14, weight: 600, fill: t.text, anchor: 'start' }),
  text({ x: x + 28, y: y + 19, text: sub, size: 12.5, fill: t.muted, anchor: 'start' })
].join('')

const legend = ({ x, y, t }) => [
  `<path d="M${x - 200} ${y} h30" stroke="${t.line}" stroke-width="1.5"/>`,
  text({ x: x - 160, y: y + 4.5, text: 'on your home network', size: 12.5, fill: t.muted, anchor: 'start' }),
  `<path d="M${x + 30} ${y} h30" stroke="${t.line}" stroke-width="1.5" stroke-dasharray="4 4"/>`,
  text({ x: x + 70, y: y + 4.5, text: 'over the internet', size: 12.5, fill: t.muted, anchor: 'start' })
].join('')

const link = ({ d, t, dashed = false, arrow = false }) =>
  `<path d="${d}" fill="none" stroke="${t.line}" stroke-width="1.5" stroke-linecap="round"${dashed ? ' stroke-dasharray="4 4"' : ''}${arrow ? ' marker-end="url(#tip)"' : ''}/>`

const note = ({ x, y, text: content, t, anchor = 'middle' }) =>
  text({ x, y, text: content, size: 12.5, fill: t.muted, anchor, halo: t.page })

const iconAt = ({ name, x, y, size, colour }) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`

const text = ({ x, y, text: content, size, weight = 400, fill, anchor = 'middle', halo }) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${halo ? ` stroke="${halo}" stroke-width="6" stroke-linejoin="round" paint-order="stroke"` : ''}>${escape(content)}</text>`

const svg = ({ width, height, body, theme }) => [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">`,
  `<defs><marker id="tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1.5 L8 5 L1 8.5" fill="none" stroke="${theme.line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`,
  ...body,
  '</svg>',
  ''
].join('\n')

const escape = (content) => content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const poller = (t) => ({
  width: 680,
  height: 560,
  body: [
    link({ d: 'M312 50 C230 50 170 110 170 196', t, arrow: true }),
    note({ x: 196, y: 120, text: 'socket open', t, anchor: 'end' }),
    link({ d: 'M200 222 C270 168 410 168 480 222', t, arrow: true }),
    note({ x: 340, y: 166, text: 'publish readings', t }),
    link({ d: 'M484 254 C410 320 270 320 200 256', t, arrow: true }),
    note({ x: 340, y: 322, text: 'timer fires', t }),
    link({ d: 'M170 336 C170 410 236 446 306 446', t, arrow: true }),
    note({ x: 182, y: 420, text: 'read or connect error', t, anchor: 'end' }),
    link({ d: 'M374 446 C700 446 700 50 372 50', t, arrow: true, dashed: true }),
    note({ x: 600, y: 470, text: 'retry after a delay', t }),
    endpoint({ x: 340, y: 24, icon: 'plug', tone: 'sky', title: 'Connect', sub: ['open one Modbus socket'] }, t),
    endpoint({ x: 170, y: 210, icon: 'refresh-cw', tone: 'green', title: 'Read', sub: ['one pass over', 'the registers'] }, t),
    endpoint({ x: 510, y: 210, icon: 'timer', tone: 'neutral', title: 'Wait', sub: ['your poll interval'] }, t),
    endpoint({ x: 340, y: 420, icon: 'wifi-off', tone: 'rose', title: 'Offline', sub: ['last readings stay', 'on screen'] }, t)
  ]
})

const appleHome = (t) => {
  const rows = [
    { icon: 'sun', tone: 'amber', name: 'Solar', value: '2.5 kW', tile: 'Solar Production', shown: '2.5°' },
    { icon: 'house', tone: 'neutral', name: 'Home', value: '0.4 kW', tile: 'Home Consumption', shown: '0.4°' },
    { icon: 'utility-pole', tone: 'blue', name: 'Grid', value: '0.0 kW', tile: 'Grid Power', shown: '0.0°' },
    { icon: 'battery-medium', tone: 'violet', name: 'Battery', value: '2.3 kW charging', tile: 'Battery Power', shown: '2.3°' },
    { icon: 'battery-charging', tone: 'green', name: 'Battery charge', value: '31%', tile: 'Humidity', shown: '31%', humid: true }
  ]
  const top = 64
  const step = 82
  return {
    width: 680,
    height: top + rows.length * step + 56,
    body: [
      text({ x: 40, y: 34, text: 'On the dashboard', size: 13, weight: 600, fill: t.muted, anchor: 'start' }),
      text({ x: 396, y: 34, text: 'In the Home app', size: 13, weight: 600, fill: t.muted, anchor: 'start' }),
      ...rows.map((row, i) => homeRow({ ...row, y: top + i * step, t })),
      text({ x: 340, y: top + rows.length * step + 30, text: 'HomeKit has no power sensor, so power travels as °C and charge as humidity.', size: 12.5, fill: t.muted })
    ]
  }
}

const homeRow = ({ icon, tone, name, value, tile, shown, humid, y, t }) => [
  iconAt({ name: icon, x: 40, y: y + 21, size: 24, colour: t.tones[tone] }),
  text({ x: 80, y: y + 30, text: name, size: 14, weight: 600, fill: t.text, anchor: 'start' }),
  text({ x: 80, y: y + 50, text: value, size: 13, fill: t.tones[tone], anchor: 'start' }),
  link({ d: `M262 ${y + 34} H372`, t, arrow: true }),
  `<rect x="396" y="${y}" width="244" height="68" rx="16" fill="${t.panel}"/>`,
  `<circle cx="428" cy="${y + 34}" r="16" fill="${t.tile}"/>`,
  iconAt({ name: humid ? 'droplet' : 'thermometer', x: 419, y: y + 25, size: 18, colour: t.tones[tone] }),
  text({ x: 456, y: y + 30, text: tile, size: 14, weight: 600, fill: t.text, anchor: 'start' }),
  text({ x: 456, y: y + 50, text: shown, size: 13, fill: t.muted, anchor: 'start' })
].join('')

const configuration = (t) => {
  const layers = [
    { icon: 'layers', tone: 'amber', title: 'settings.json', sub: 'saved in the setup wizard or Settings' },
    { icon: 'key-round', tone: 'neutral', title: '.env', sub: 'seeds the first boot only' },
    { icon: 'list-check', tone: 'neutral', title: 'Built-in defaults', sub: 'used when nothing else is set' }
  ]
  const hour = 25
  const barX = 40
  const barY = 330
  const at = (h) => barX + h * hour
  const windows = [
    { from: 8, to: 12, label: 'every 2 s', tone: 'sky' },
    { from: 17, to: 21, label: 'every 10 s', tone: 'violet' }
  ]
  return {
    width: 680,
    height: 450,
    body: [
      text({ x: 40, y: 32, text: 'Which value wins (top beats bottom)', size: 15, weight: 600, fill: t.text, anchor: 'start' }),
      ...layers.map((layer, i) => [
        `<rect x="40" y="${50 + i * 54}" width="600" height="46" rx="12" fill="${t.panel}"/>`,
        iconAt({ name: layer.icon, x: 58, y: 64 + i * 54, size: 18, colour: t.tones[layer.tone] }),
        text({ x: 90, y: 78 + i * 54, text: layer.title, size: 14, weight: 600, fill: t.text, anchor: 'start' }),
        text({ x: 622, y: 78 + i * 54, text: layer.sub, size: 13, fill: t.muted, anchor: 'end' })
      ].join('')),
      text({ x: 40, y: 268, text: 'When the bridge polls', size: 15, weight: 600, fill: t.text, anchor: 'start' }),
      text({ x: 640, y: 268, text: 'example schedule', size: 12.5, fill: t.muted, anchor: 'end' }),
      `<rect x="${barX}" y="${barY}" width="${24 * hour}" height="28" rx="8" fill="${t.tile}"/>`,
      ...windows.map((w) => [
        `<rect x="${at(w.from)}" y="${barY}" width="${(w.to - w.from) * hour}" height="28" rx="8" fill="${t.tones[w.tone]}" fill-opacity="0.85"/>`,
        text({ x: (at(w.from) + at(w.to)) / 2, y: barY - 12, text: w.label, size: 13, weight: 600, fill: t.tones[w.tone] })
      ].join('')),
      text({ x: at(4), y: barY - 12, text: 'default: every 5 s', size: 13, fill: t.muted }),
      text({ x: at(14.5), y: barY - 12, text: '5 s', size: 13, fill: t.muted }),
      text({ x: at(22.5), y: barY - 12, text: '5 s', size: 13, fill: t.muted }),
      ...[0, 6, 12, 18, 24].map((h) => text({ x: at(h), y: barY + 50, text: `${String(h).padStart(2, '0')}:00`, size: 12, fill: t.faint, anchor: h === 0 ? 'start' : h === 24 ? 'end' : 'middle' })),
      text({ x: 340, y: 420, text: "Each cycle checks the clock, uses that window's interval, then waits.", size: 13, fill: t.muted })
    ]
  }
}

const google = (t) => {
  const lane = { g: 110, t: 340, b: 570 }
  const steps = [
    { title: 'Link the account', ask: '/auth, then /token', reply: 'bearer token (client secret checked)' },
    { title: 'SYNC: which devices?', ask: 'POST /fulfillment', reply: 'battery + four power devices' },
    { title: 'QUERY: current values?', ask: 'POST /fulfillment', reply: 'current readings from state' }
  ]
  const top = 200
  const step = 112
  const bottom = top + steps.length * step - 20
  return {
    width: 680,
    height: bottom + 20,
    body: [
      ...Object.values(lane).map((x) => `<path d="M${x} 150 V${bottom}" stroke="${t.line}" stroke-width="1" stroke-dasharray="2 5" stroke-linecap="round"/>`),
      endpoint({ x: lane.g, y: 24, icon: 'cloud', tone: 'cyan', title: 'Google Home', sub: [] }, t),
      endpoint({ x: lane.t, y: 24, icon: 'globe', tone: 'indigo', title: 'Cloudflare Tunnel', sub: [] }, t),
      endpoint({ x: lane.b, y: 24, icon: 'container', tone: 'amber', title: 'sigen-home-bridge', sub: [] }, t),
      ...steps.map((s, i) => {
        const y = top + i * step
        return [
          text({ x: 340, y: y - 16, text: `${i + 1}. ${s.title}`, size: 14, weight: 600, fill: t.text, halo: t.page }),
          link({ d: `M${lane.g + 4} ${y + 14} H${lane.b - 6}`, t, arrow: true }),
          `<circle cx="${lane.t}" cy="${y + 14}" r="4" fill="${t.page}" stroke="${t.tones.indigo}" stroke-width="1.5"/>`,
          note({ x: (lane.g + lane.t) / 2, y: y + 6, text: s.ask, t }),
          link({ d: `M${lane.b - 4} ${y + 46} H${lane.g + 6}`, t, arrow: true, dashed: true }),
          note({ x: 340, y: y + 38, text: s.reply, t })
        ].join('')
      })
    ]
  }
}

const diagrams = { architecture, poller, 'apple-home': appleHome, configuration, google }

if (process.argv[1] === fileURLToPath(import.meta.url)) buildDiagrams(process.argv[2]?.split(','))
