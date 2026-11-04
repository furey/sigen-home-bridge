import { nextTick, ref } from 'vue'
import { useSettings } from './useSettings.js'

export const useGatewayScan = ({ host, port, unitId, testResult, onScanStart = () => {} }) => {
  const { discoverGateway, testGateway } = useSettings()
  const scanning = ref(false)
  const scanCandidates = ref(null)
  const scanError = ref('')
  const testing = ref(false)
  let latestTestId = 0

  const cancelTest = () => {
    latestTestId += 1
    testing.value = false
  }

  const test = async () => {
    const testId = ++latestTestId
    testing.value = true
    testResult.value = null
    try {
      const result = await testGateway({
        host: host.value.trim(),
        port: Number(port.value),
        unitId: Number(unitId.value)
      })
      if (testId === latestTestId) testResult.value = result
    } finally {
      if (testId === latestTestId) testing.value = false
    }
  }

  const applyCandidate = async (candidate) => {
    cancelTest()
    host.value = candidate.host
    await nextTick()
    testResult.value = { ok: true, batterySoc: candidate.batterySoc }
  }

  const scan = async () => {
    onScanStart()
    cancelTest()
    scanning.value = true
    testResult.value = null
    scanCandidates.value = null
    scanError.value = ''
    try {
      const result = await discoverGateway({
        port: Number(port.value),
        unitId: Number(unitId.value)
      })
      if (result.error) {
        scanError.value = result.error
        return
      }
      const candidates = result.candidates ?? []
      if (candidates.length === 1) await applyCandidate(candidates[0])
      await nextTick()
      scanCandidates.value = candidates
    } finally {
      scanning.value = false
    }
  }

  return { scanning, scanCandidates, scanError, scan, applyCandidate, testing, test, cancelTest }
}
