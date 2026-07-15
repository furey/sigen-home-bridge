import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const repo = 'https://github.com/furey/sigen-home-bridge'
const site = 'https://furey.github.io/sigen-home-bridge/'
const description =
  'Your live Sigenergy data via a local dashboard, Apple Home, and Google Home. Self-hosted, read-only, no cloud account.'
const ogImage = `${site}og.png`
const ogImageAlt =
  'sigen-home-bridge: a live, local dashboard for Sigenergy solar and battery, with Apple Home and Google Home'

const canonicalPath = (relativePath) =>
  `${site}${relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`

const pageTitle = (pageData) =>
  pageData.frontmatter.layout === 'home' || !pageData.title
    ? 'sigen-home-bridge'
    : `${pageData.title} · sigen-home-bridge`

export default withMermaid(defineConfig({
  base: '/sigen-home-bridge/',
  lang: 'en-AU',
  title: 'sigen-home-bridge',
  description,
  appearance: 'dark',
  cleanUrls: true,
  lastUpdated: true,
  metaChunk: true,
  srcExclude: ['DEEP_DIVE.md', 'README.md', '**/node_modules/**'],
  sitemap: { hostname: site },

  head: [
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/sigen-home-bridge/favicon-32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/sigen-home-bridge/favicon-192.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/sigen-home-bridge/favicon-192.png' }],
    ['meta', { name: 'theme-color', content: '#09090b' }],
    ['meta', { name: 'color-scheme', content: 'dark light' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'sigen-home-bridge' }],
    ['meta', { property: 'og:locale', content: 'en_AU' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }]
  ],

  transformPageData(pageData) {
    const canonical = canonicalPath(pageData.relativePath)
    const title = pageTitle(pageData)
    const pageDescription =
      pageData.frontmatter.description || pageData.description || description
    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: pageDescription }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:image', content: ogImage }],
      ['meta', { property: 'og:image:type', content: 'image/png' }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { property: 'og:image:alt', content: ogImageAlt }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: pageDescription }],
      ['meta', { name: 'twitter:image', content: ogImage }],
      ['meta', { name: 'twitter:image:alt', content: ogImageAlt }]
    )
  },

  themeConfig: {
    logo: { light: '/logo-light.svg', dark: '/logo-dark.svg' },
    siteTitle: 'sigen-home-bridge',

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      { text: 'Reference', link: '/reference/', activeMatch: '/reference/' },
      {
        text: 'More',
        items: [
          { text: 'JSON API', link: '/guide/json-api' },
          { text: 'Register map', link: '/reference/register-map' },
          { text: 'Security model', link: '/reference/security' },
          { text: 'GitHub', link: repo },
          { text: 'Discussions', link: `${repo}/discussions` }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Start here',
          collapsed: false,
          items: [
            { text: 'What it is', link: '/guide/' },
            { text: 'Getting started', link: '/guide/getting-started' }
          ]
        },
        {
          text: 'Using the bridge',
          collapsed: false,
          items: [
            { text: 'The dashboard', link: '/guide/dashboard' },
            { text: 'Devices', link: '/guide/devices' },
            { text: 'Tariffs & cost', link: '/guide/tariffs' },
            { text: 'Alerts', link: '/guide/alerts' }
          ]
        },
        {
          text: 'Connect it up',
          collapsed: false,
          items: [
            { text: 'Apple Home', link: '/guide/apple-home' },
            { text: 'Google Home', link: '/guide/google-home' },
            { text: 'The JSON API', link: '/guide/json-api' },
            { text: 'Reaching it from away', link: '/guide/remote-access' }
          ]
        },
        {
          text: 'Help',
          collapsed: false,
          items: [
            { text: 'Troubleshooting', link: '/guide/troubleshooting' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Technical deep dive',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Configuration', link: '/reference/configuration' },
            { text: 'Dashboard internals', link: '/reference/dashboard' }
          ]
        },
        {
          text: 'Talking to the gateway',
          collapsed: false,
          items: [
            { text: 'Register map', link: '/reference/register-map' },
            { text: 'Devices & sources', link: '/reference/devices' },
            { text: 'Control registers', link: '/reference/control-registers' }
          ]
        },
        {
          text: 'Interfaces',
          collapsed: false,
          items: [
            { text: 'HTTP API', link: '/reference/http-api' },
            { text: 'Apple Home mapping', link: '/reference/apple-home' },
            { text: 'Google Home fulfillment', link: '/reference/google-home' },
            { text: 'Cloudflare Tunnel & Access', link: '/reference/cloudflare' }
          ]
        },
        {
          text: 'Subsystems',
          collapsed: false,
          items: [
            { text: 'Energy tariffs', link: '/reference/tariffs' },
            { text: 'Alerts engine', link: '/reference/alerts' },
            { text: 'Security model', link: '/reference/security' }
          ]
        },
        {
          text: 'Working on it',
          collapsed: false,
          items: [
            { text: 'Local development', link: '/reference/development' }
          ]
        }
      ]
    },

    outline: { level: [2, 3], label: 'On this page' },

    socialLinks: [
      { icon: 'github', link: repo }
    ],

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub'
    },

    search: {
      provider: 'local'
    },

    lastUpdated: {
      text: 'Updated',
      formatOptions: { dateStyle: 'medium', timeStyle: 'short' }
    },

    docFooter: {
      prev: 'Previous',
      next: 'Next'
    },

    footer: {
      message:
        'MIT licensed. Not affiliated with or endorsed by Sigenergy, Apple, Google, or Cloudflare.',
      copyright: `<a href="${repo}">Source on GitHub</a>`
    }
  },

  mermaid: {
    securityLevel: 'strict',
    flowchart: { useMaxWidth: true },
    themeVariables: { fontFamily: 'inherit' }
  }
}))
