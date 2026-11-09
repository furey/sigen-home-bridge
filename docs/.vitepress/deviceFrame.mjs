const fullScreens = new Set([
  'dashboard-tablet.png',
  'fullscreen-solar-tablet.png',
  'fullscreen-cost-tablet.png',
  'trends-tablet.png'
])

export const deviceFrame = (md) => {
  const renderImage = md.renderer.rules.image
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const src = tokens[idx].attrGet('src') ?? ''
    if (isScreenshot(src) && !isFullScreen(src)) tokens[idx].attrJoin('class', 'doc-screenshot')
    const html = renderImage(tokens, idx, options, env, self)
    if (!isFullScreen(src)) return html
    return `<span class="device-frame"><span class="device-frame__screen">${html}</span></span>`
  }
}

const screenshotFile = (src) => src.match(/(?:^|\/)screenshots\/([^/]+)$/)?.[1]

const isScreenshot = (src) => Boolean(screenshotFile(src))

const isFullScreen = (src) => fullScreens.has(screenshotFile(src))
