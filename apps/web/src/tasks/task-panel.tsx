import type { TaskDto } from '@archipelago/shared'

export function TaskPanel({ title, tasks }: { title: string; tasks: TaskDto[] }) {
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </div>
  )
}
