import { useCallback } from 'react'
import { usePersistedState } from './usePersistedState'

// Per-panel collapsed state, persisted under `ft.collapse.<id>` so it survives
// reloads. These keys are deliberately NOT in shareConfig's SHARE_KEYS — collapse
// is a local view preference, not part of a shared dashboard config.
export function useCollapsed(id: string, initial = false) {
  const [collapsed, setCollapsed] = usePersistedState(`ft.collapse.${id}`, initial)
  const toggle = useCallback(() => setCollapsed((c) => !c), [setCollapsed])
  return [collapsed, toggle] as const
}
