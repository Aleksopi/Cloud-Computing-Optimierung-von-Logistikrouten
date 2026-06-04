import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// React.StrictMode intentionally removed:
// It double-invokes useEffect in development, causing MapLibre GL to create
// two WebGL contexts on the same canvas element → "WebGL context was lost".
// MapLibre manages its own lifecycle; StrictMode offers no benefit here.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
