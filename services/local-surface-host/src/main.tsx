import React from 'react'
import ReactDOM from 'react-dom/client'
import './host-runtime/infrastructure/api.js'
import '@movscript/theme/theme.css'
import '@movscript/ui/styles/surface-host.css'
import './styles.css'
import './i18n'
import { initMovScriptTheme } from '@movscript/theme'
import { LocalSurfaceHostApp } from './app/LocalSurfaceHostApp.js'

initMovScriptTheme()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LocalSurfaceHostApp />
  </React.StrictMode>,
)
