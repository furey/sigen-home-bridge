import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import { vReveal } from './directives/reveal.js'
import './style.css'

const blockPinchZoom = (event) => event.preventDefault()
document.addEventListener('gesturestart', blockPinchZoom)
document.addEventListener('gesturechange', blockPinchZoom)

createApp(App).use(router).directive('reveal', vReveal).mount('#app')
