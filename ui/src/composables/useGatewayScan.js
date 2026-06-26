import { nextTick, ref } from 'vue'
import { useSettings } from './useSettings.js'

export const useGatewayScan = ({ host, port, unitId, testResult }) => {
  const { discoverGateway } = useSettings()
  const scanning = ref(false)
  const scanCandidates = ref(null)
  const scanError = ref('')

  const applyCandidate = async (candidate) => {
    host.value = candidate.host
    await nextTick()
    testResult.value = { ok: true, batterySoc: candidate.batterySoc }
  }

  const scan = async () => {
    scanning.value = true
    testResult.value = null
    scanCandidates.value = null
    scanError.value = ''
    try {
      const { candidates } = await discoverGateway({
        port: Number(port.value),
        unitId: Number(unitId.value)
      })
      if (candidates.length === 1) await applyCandidate(candidates[0])
      await nextTick()
      scanCandidates.value = candidates
    } catch (error) {
      scanError.value = error.message
    }
    scanning.value = false
  }

  return { scanning, scanCandidates, scanError, scan, applyCandidate }
}
