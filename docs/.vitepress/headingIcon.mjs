const iconName = /^[a-z0-9-]+$/

export const headingIcon = (md) => {
  md.core.ruler.push('heading_icon', (state) => {
    const icon = state.env.frontmatter?.icon
    if (!iconName.test(icon ?? '')) return
    const open = state.tokens.findIndex((token) => token.type === 'heading_open' && token.tag === 'h1')
    if (open === -1) return
    const marker = new state.Token('html_inline', '', 0)
    marker.content = `<HeadingIcon name="${icon}" />`
    state.tokens[open + 1].children.unshift(marker)
  })
}
