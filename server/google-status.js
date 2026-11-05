export const recordGoogleAccepted = (route) => {
  status.lastAccepted = { at: new Date().toISOString(), route }
}

export const recordGoogleRejected = ({ route, reason }) => {
  status.lastRejected = { at: new Date().toISOString(), route, reason }
}

export const googleStatus = () => ({ ...status })

const status = { lastAccepted: null, lastRejected: null }
