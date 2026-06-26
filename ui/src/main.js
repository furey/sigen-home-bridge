import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import './style.css'

const blockPinchZoom = (event) => event.preventDefault()
document.addEventListener('gesturestart', blockPinchZoom)
document.addEventListener('gesturechange', blockPinchZoom)

createApp(App).use(router).mount('#app')
