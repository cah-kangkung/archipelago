import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useApi } from '../api/context'
import { useToast } from '../app/toast'

export function AppShell() {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.clear()
      void navigate({ to: '/login' })
    },
    // Keep the session: the cookie is still valid, so pretending to be logged out would be a lie.
    onError: () => toast.show("Couldn't log out. Try again."),
  })

  return (
    <div className="flex h-dvh flex-col bg-surface-secondary">
      <header className="flex h-14 shrink-0 items-center justify-between bg-brand pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-text-on-brand">
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
