import { ref } from 'vue'

const query = window.matchMedia('(hover: hover)')
const hoverCapable = ref(query.matches)
query.addEventListener('change', (event) => { hoverCapable.value = event.matches })

export const useHoverCapable = () => hoverCapable
