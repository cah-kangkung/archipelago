import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from './button'
import { Icon } from './icon'

export type ToastTone = 'neutral' | 'success' | 'error'
export type ToastOptions = { tone?: ToastTone; action?: { label: string; onAction: () => void } }
type Toast = { id: number; message: string; tone: ToastTone; action?: ToastOptions['action'] }
type ToastApi = { show(message: string, options?: ToastOptions): void }

const ToastContext = createContext<ToastApi | null>(null)
const DISMISS_AFTER_MS = 5000

const toneIcon = {
  neutral: { icon: Info, className: 'text-brand' },
  success: { icon: CheckCircle, className: 'text-leaf-text' },
  error: { icon: WarningCircle, className: 'text-coral-text' },
} as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = Date.now() + Math.random()
      const tone = options.tone ?? 'neutral'
      setToasts((current) => [...current, { id, message, tone, action: options.action }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      )
    },
    [dismiss],
  )

  // Unmounting the provider must not leave timers firing into a dead tree.
  useEffect(() => {
    const live = timers.current
    return () => {
      for (const timer of live.values()) clearTimeout(timer)
      live.clear()
    }
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            data-tone={t.tone}
            className="glass-strong pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl py-2 pr-2 pl-3 text-label text-text-primary shadow-2"
          >
            <Icon icon={toneIcon[t.tone].icon} className={toneIcon[t.tone].className} />
            <p className="flex-1">{t.message}</p>
            {t.action && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  t.action?.onAction()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </Button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext)
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>')
  return toast
}
