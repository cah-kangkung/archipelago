/** The empty world's prompt (spec 17.4): over the ghost island, or in the card view. */
export function UnchartedCard({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex w-64 flex-col items-center gap-3 rounded-lg bg-surface-primary/95 p-4 text-center shadow">
      <h2 className="font-semibold text-text-primary">Uncharted waters</h2>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="min-h-11 rounded-md bg-brand px-4 text-sm text-text-on-brand"
        >
          Create your first island
        </button>
      )}
    </div>
  )
}
