import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { ApiError } from '../api/api'
import { useApi } from '../api/context'
import { meQuery } from '../world/use-world'

const inputClass =
  'min-h-11 w-full rounded-md border border-border-secondary bg-surface-primary px-3 text-base focus:border-brand focus:outline-none'

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
        className="w-full max-w-sm space-y-4 rounded-lg bg-surface-primary p-6 shadow-lg"
      >
        <h1 className="text-xl font-semibold text-text-primary">Sign in</h1>
        <label className="block space-y-1 text-sm text-text-secondary">
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
        <label className="block space-y-1 text-sm text-text-secondary">
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
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="min-h-11 w-full rounded-md bg-brand font-medium text-text-on-brand disabled:opacity-60"
        >
          Sign in
        </button>
      </form>
    </main>
  )
}
