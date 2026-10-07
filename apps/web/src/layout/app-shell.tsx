import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useApi } from '../api/context'

export function AppShell() {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSettled: () => {
      queryClient.clear()
      void navigate({ to: '/login' })
    },
  })

  return (
    <div className="flex h-dvh flex-col bg-surface-secondary">
      <header className="flex h-14 shrink-0 items-center justify-between bg-brand px-4 text-text-on-brand">
        <Link to="/" className="flex min-h-11 items-center font-semibold">
          Archipelago
        </Link>
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="min-h-11 rounded-md px-3 text-sm hover:bg-brand-secondary"
        >
          Log out
        </button>
      </header>
      <Outlet />
    </div>
  )
}
