import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useSettings } from './useSettings.js'
import { useSession } from './useSession.js'

export const useSettingsSection = ({ snapshot, buildPatch, onSaved }) => {
  const { applyPatch } = useSettings()
  const { unlocked } = useSession()
  const status = ref('idle')
  const error = ref('')
  const pristine = ref(null)
  const retryAfterReauth = ref(false)

  const dirty = computed(() => pristine.value !== null && serialize(snapshot()) !== pristine.value)

  const markPristine = () => {
    pristine.value = serialize(snapshot())
    status.value = 'idle'
  }

  const save = async () => {
    status.value = 'saving'
    error.value = ''
    try {
      await applyPatch(buildPatch())
      onSaved?.()
      pristine.value = serialize(snapshot())
      status.value = 'saved'
    } catch (saveError) {
      error.value = saveError.message
      status.value = 'error'
      retryAfterReauth.value = Boolean(saveError.locked)
    }
  }

  watch(dirty, (isDirty) => {
    if (isDirty && status.value === 'saved') status.value = 'idle'
  })

  watch(unlocked, (now, was) => {
    if (now && !was && retryAfterReauth.value) {
      retryAfterReauth.value = false
      save()
    }
  })

  const pendingLeave = ref(false)
  let resolveLeave = null
  onBeforeRouteLeave(() => {
    if (!dirty.value) return true
    return new Promise((resolve) => {
      resolveLeave = resolve
      pendingLeave.value = true
    })
  })

  const settleLeave = (proceed) => {
    pendingLeave.value = false
    resolveLeave?.(proceed)
    resolveLeave = null
  }

  return {
    status, error, dirty, save, markPristine,
    pendingLeave, confirmLeave: () => settleLeave(true), cancelLeave: () => settleLeave(false)
  }
}

const serialize = (value) => JSON.stringify(value)
