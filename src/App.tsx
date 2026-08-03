import { BuildInfo } from './components/BuildInfo'
import { Dashboard } from './components/Dashboard'
import { ShareControls } from './components/ShareControls'
import { ThemeToggle } from './components/ThemeToggle'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-2 py-8 sm:px-6 lg:px-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">find-trends</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Charts from Google Sheets, with CSV comparison.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ShareControls />
            <ThemeToggle />
          </div>
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
