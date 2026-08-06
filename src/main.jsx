import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { ToastProvider } from './context/ToastContext'
import { AuthProvider } from './context/AuthContext'
import { CategoryProvider } from './context/CategoryContext'
import ErrorBoundary from './components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <CategoryProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </CategoryProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
