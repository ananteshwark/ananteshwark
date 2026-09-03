import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth'
import { initTheme } from './theme'
import ConfirmHost from './components/ConfirmHost'
import './styles.css'

initTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <ConfirmHost />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
