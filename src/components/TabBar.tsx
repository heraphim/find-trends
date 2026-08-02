import { capitalize } from '../lib/labels'

interface Props {
  cities: string[]
  active: string
  onChange: (city: string) => void
}

export function TabBar({ cities, active, onChange }: Props) {
  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
      {cities.map((city) => {
        const isActive = city === active
        return (
          <button
            key={city}
            type="button"
            onClick={() => onChange(city)}
            aria-current={isActive ? 'page' : undefined}
            className={
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
              (isActive
                ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100')
            }
          >
            {capitalize(city)}
          </button>
        )
      })}
    </nav>
  )
}
