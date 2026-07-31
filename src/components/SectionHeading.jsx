export default function SectionHeading({ title, accent = false }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <h2 className="whitespace-nowrap font-display text-[18px] font-bold tracking-tight text-white">
        {title}
      </h2>
      <div className={`h-px flex-1 rounded-full ${accent ? 'divider-fade' : 'bg-white/[0.07]'}`} />
    </div>
  )
}
