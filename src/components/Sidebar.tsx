import type { SheetData } from '../lib/data'

// Shared types for the category model. (The old vertical Sidebar component was
// replaced by the horizontal CategoryBar; these types moved with it.)
export type SheetState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SheetData }

export interface SidebarCategory {
  key: string // 'weather' (city category) or a global sheet name
  title: string
  isGlobal: boolean
  status: 'loading' | 'error' | 'ready'
  message?: string
  metrics: string[] // metric column keys (plottable)
  events: string[] // event column keys (day classifiers)
}
