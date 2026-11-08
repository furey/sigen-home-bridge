const screenshot = /(^|\/)screenshots\/[^/]+$/

export const deviceFrame = (md) => {
  const renderImage = md.renderer.rules.image
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const html = renderImage(tokens, idx, options, env, self)
    if (!screenshot.test(tokens[idx].attrGet('src') ?? '')) return html
    return `<span class="device-frame"><span class="device-frame__screen">${html}</span></span>`
  }
}
