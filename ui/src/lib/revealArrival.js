export const latestArrival = () => arrival

export const beginReveal = () => { arrival = { fresh: true, at: performance.now(), revealed: false } }

export const cancelReveal = () => { arrival = null }

let arrival = null
