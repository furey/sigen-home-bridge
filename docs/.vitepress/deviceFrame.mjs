const fullScreens = new Set([
  'dashboard-tablet.png',
  'fullscreen-solar-tablet.png',
  'fullscreen-cost-tablet.png',
  'trends-tablet.png'
])

export const deviceFrame = (md) => {
  const renderImage = md.renderer.rules.image
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const html = renderImage(tokens, idx, options, env, self)
    if (!isFullScreen(tokens[idx].attrGet('src') ?? '')) return html
    return `<span class="device-frame"><span class="device-frame__screen">${html}</span></span>`
  }
}

const isFullScreen = (src) => {
  const [, folder, file] = src.match(/(?:^|\/)(screenshots)\/([^/]+)$/) ?? []
  return folder === 'screenshots' && fullScreens.has(file)
}
