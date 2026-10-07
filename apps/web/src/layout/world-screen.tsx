import { useWorld } from '../world/use-world'

export function WorldScreen() {
  const world = useWorld()
  if (world.isPending) return <p className="p-4 text-text-secondary">Loading your islands…</p>
  if (world.isError) {
    return (
      <p role="alert" className="p-4 text-error">
        Could not load your islands.
      </p>
    )
  }
  return (
    <section className="p-4">
      <h2 className="text-lg font-semibold">Your islands</h2>
      <ul>
        {world.data.projects.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </section>
  )
}
