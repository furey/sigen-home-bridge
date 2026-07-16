import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const REPO = process.env.OG_REPO || '/work'
const OUT = process.env.OG_OUT || `${REPO}/docs/public/og.png`
const WIDTH = 1200
const HEIGHT = 630

const generate = async () => {
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] })
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1
  })
  const page = await context.newPage()
  await page.setContent(card(), { waitUntil: 'load' })
  await waitForInter(page)
  mkdirSync(dirname(OUT), { recursive: true })
  await page.screenshot({ path: OUT, type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } })
  await browser.close()
  console.log(`[og] wrote ${OUT}`)
}

const waitForInter = async (page) => {
  await page.evaluate(() => document.fonts.load('700 60px "Inter cv01"'))
  await page
    .waitForFunction(() => document.fonts.check('700 60px "Inter cv01"'), null, { timeout: 9000 })
    .catch(() => console.warn('[og] Inter did not confirm in time; continuing'))
  await page.evaluate(() => document.fonts.ready)
}

const card = () => {
  const font = base64(`${REPO}/docs/.vitepress/theme/fonts/inter-latin-cv01.woff2`)
  const shot = base64(`${REPO}/docs/screenshots/dashboard-desktop.png`)
  const logo = readFileSync(`${REPO}/docs/public/logo.svg`, 'utf8').replace(/<\?xml.*?\?>/s, '').trim()
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Inter cv01';
    font-style: normal;
    font-weight: 100 900;
    src: url(data:font/woff2;base64,${font}) format('woff2');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    position: relative;
    overflow: hidden;
    background: #09090b;
    color: #fafafa;
    font-family: 'Inter cv01', system-ui, sans-serif;
    font-feature-settings: 'cv01' 1, 'tnum' 1;
    -webkit-font-smoothing: antialiased;
  }
  .glow {
    position: absolute;
    top: 50%;
    right: -40px;
    width: 780px;
    height: 780px;
    transform: translateY(-50%);
    border-radius: 50%;
    background: radial-gradient(circle at center,
      rgba(245, 158, 11, 0.78) 0%,
      rgba(232, 121, 249, 0.62) 40%,
      rgba(103, 232, 249, 0.42) 66%,
      transparent 80%);
    filter: blur(80px);
    opacity: 0.8;
  }
  .frame {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr 1.05fr;
    align-items: center;
    gap: 56px;
    height: 100%;
    padding: 72px;
  }
  .left {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .brand svg { width: 54px; height: 54px; }
  .brand .name {
    font-size: 29px;
    font-weight: 600;
    letter-spacing: -0.025em;
    color: #fafafa;
  }
  .headline {
    font-size: 47px;
    line-height: 1.08;
    font-weight: 700;
    letter-spacing: -0.03em;
    background: linear-gradient(120deg, #f59e0b 20%, #e879f9 55%, #67e8f9);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: saturate(1.15);
  }
  .sub {
    margin-top: 22px;
    max-width: 19ch;
    font-size: 25px;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: #a1a1aa;
  }
  .url {
    font-size: 21px;
    letter-spacing: -0.01em;
    color: #71717a;
  }
  .url b { color: #fbbf24; font-weight: 600; }
  .right {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tablet {
    position: relative;
    width: 100%;
    padding: 17px;
    border-radius: 30px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: linear-gradient(158deg, #26262b 0%, #141417 42%, #0b0b0e 100%);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.06),
      inset 0 1px 1px rgba(255, 255, 255, 0.09),
      0 40px 70px -26px rgba(0, 0, 0, 0.85),
      0 14px 30px -16px rgba(0, 0, 0, 0.7);
  }
  .tablet::before {
    content: "";
    position: absolute;
    top: 8.5px;
    left: 50%;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle at 35% 32%, #3b3b45, #08080a 75%);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04);
  }
  .screen {
    position: relative;
    overflow: hidden;
    border-radius: 13px;
    background: #09090b;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.7), inset 0 0 24px rgba(0, 0, 0, 0.45);
  }
  .screen::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0) 38%);
  }
  .screen img { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="frame">
    <div class="left">
      <div class="brand">${logo}<span class="name">sigen-home-bridge</span></div>
      <div>
        <h1 class="headline">Your Sigenergy data,<br>live and local.</h1>
        <p class="sub">Self-hosted, read-only, no cloud account.</p>
      </div>
      <p class="url">furey.github.io/<b>sigen-home-bridge</b></p>
    </div>
    <div class="right">
      <div class="tablet"><div class="screen"><img src="data:image/png;base64,${shot}" alt=""></div></div>
    </div>
  </div>
</body>
</html>`
}

const base64 = (path) => readFileSync(path).toString('base64')

generate()
