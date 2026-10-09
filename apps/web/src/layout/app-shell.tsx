import { Sailboat, SignOut } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useApi } from '../api/context'
import { EconomyBar } from '../economy/economy-bar'
import { Icon } from '../ui/icon'
import { useToast } from '../ui/toast'

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
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 bg-brand pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-text-on-brand shadow-1">
        <Link
          to="/"
          aria-label="Archipelago"
          className="flex min-h-11 items-center gap-2 text-title font-heading"
        >
          <Icon icon={Sailboat} size={24} active />
          <span aria-hidden className="hidden sm:inline">
            Archipelago
          </span>
        </Link>
        <EconomyBar />
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-label font-label hover:bg-brand-secondary"
        >
          <Icon icon={SignOut} />
          <span className="sr-only sm:not-sr-only">Log out</span>
        </button>
      </header>
      <Outlet />
    </div>
  )
}
