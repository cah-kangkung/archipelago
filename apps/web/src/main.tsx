import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createApi } from './api/api'
import { createClient } from './api/client'
import { AppProviders } from './app/providers'
import { createAppRuntime } from './app/runtime'
import '@fontsource-variable/nunito'
import './styles.css'
import { noBlurEnabled } from './world/perf-flag'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
if (noBlurEnabled()) document.documentElement.classList.add('no-blur')

const api = createApi(createClient(window.location.origin))
const { router, queryClient } = createAppRuntime(api)

createRoot(root).render(
  <StrictMode>
    <AppProviders api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
