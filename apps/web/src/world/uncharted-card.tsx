import { Button } from '../ui/button'
import { GlassPanel } from '../ui/glass-panel'

/** The empty world's prompt (spec 17.4): over the ghost island, or in the card view. */
export function UnchartedCard({ onCreate }: { onCreate?: () => void }) {
  return (
    <GlassPanel
      strong
      className="flex w-64 flex-col items-center gap-3 rounded-2xl p-4 text-center"
    >
      <h2 className="text-title font-heading text-text-primary">Uncharted waters</h2>
      {onCreate && <Button onClick={onCreate}>Create your first island</Button>}
    </GlassPanel>
  )
}
