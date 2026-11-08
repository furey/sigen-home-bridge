import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import TabletDemo from './TabletDemo.vue'
import HeadingIcon from './HeadingIcon.vue'
import Diagram from './Diagram.vue'
import InstallVideo from './InstallVideo.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp: ({ app }) => {
    app.component('HeadingIcon', HeadingIcon)
    app.component('Diagram', Diagram)
    app.component('InstallVideo', InstallVideo)
  },
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-image': () => h(TabletDemo)
    })
}
