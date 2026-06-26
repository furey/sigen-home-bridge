import { shallowRef } from 'vue'

const scrubSample = shallowRef(null)

export const useScrub = () => scrubSample
