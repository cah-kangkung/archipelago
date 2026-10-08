import { createContext, type ReactNode, useContext, useState } from 'react'
import { createRewardStore, type RewardStore } from './reward-store'

const RewardContext = createContext<RewardStore | null>(null)

/** One store per app: mutations push into it, the scene and HUD read it. */
export function RewardProvider({ store, children }: { store?: RewardStore; children: ReactNode }) {
  const [value] = useState(() => store ?? createRewardStore())
  return <RewardContext.Provider value={value}>{children}</RewardContext.Provider>
}

export function useRewardStore(): RewardStore {
  const store = useContext(RewardContext)
  if (!store) throw new Error('useRewardStore must be used inside <RewardProvider>')
  return store
}
