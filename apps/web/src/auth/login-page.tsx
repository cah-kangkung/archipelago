import { Sailboat } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { inputClass } from '../editors/fields'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { meQuery } from '../world/use-world'

export function LoginPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => api.login({ email, password }),
    onSuccess: (data) => {
      queryClient.setQueryData(meQuery(api).queryKey, data)
      void navigate({ to: '/' })
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate()
  }

  const error =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'Something went wrong. Try again.'
        : null

  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-surface-primary p-6 shadow-3"
      >
        <div className="flex items-center gap-2 text-brand">
          <Icon icon={Sailboat} size={32} active />
          <span className="text-display font-heading">Archipelago</span>
        </div>
        <h1 className="text-heading font-heading text-text-primary">Sign in</h1>
        <label className="block space-y-1 text-label font-label text-text-secondary">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1 text-label font-label text-text-secondary">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-label text-error">
            {error}
          </p>
        )}
        <Button type="submit" loading={login.isPending} className="w-full">
          Sign in
        </Button>
      </form>
    </main>
  )
}
