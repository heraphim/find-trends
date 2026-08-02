import { BuildInfo } from './components/BuildInfo'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>find-trends</h1>
        <p>Charts from Google Sheets, with CSV comparison.</p>
      </header>

      <main className="app-main">
        {/* Dashboard (charts, CSV upload) goes here next. */}
        <p className="placeholder">Dashboard coming soon.</p>
      </main>

      <footer className="app-footer">
        <BuildInfo />
      </footer>
    </div>
  )
}

export default App
