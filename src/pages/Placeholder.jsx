// Empty placeholder screen — used for routes that don't have a visual design
// yet (per plan: screenshot first, then build the real page).

export default function Placeholder({ title }) {
  return (
    <div className="mx-auto max-w-[1480px] px-6 py-6 lg:px-10 lg:py-8">
      <div className="panel flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-white/[0.06] p-10">
        <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
        <p className="mt-3 text-sm text-slate-500">Coming soon — screenshot pending.</p>
      </div>
    </div>
  )
}
