import { BuildInfo } from './components/BuildInfo'
import { Dashboard } from './components/Dashboard'
import { ThemeToggle } from './components/ThemeToggle'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">find-trends</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Charts from Google Sheets, with CSV comparison.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1">
          <Dashboard />
        </main>
      </div>

      <BuildInfo />
    </div>
  )
}

export default App
