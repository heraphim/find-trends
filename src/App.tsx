import { Dashboard } from './components/Dashboard'
import { FloatingMenu } from './components/FloatingMenu'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen flex-col px-2 py-8 sm:px-6 lg:px-8">
        <main className="flex-1">
          <Dashboard />
        </main>
      </div>

      <FloatingMenu />
    </div>
  )
}

export default App
