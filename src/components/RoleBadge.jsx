import { getRoleStyle } from '../lib/roleStyles'

export default function RoleBadge({ role, compact = false }) {
  const roleStyle = getRoleStyle(role)
  return (
    <span className="relative inline-flex w-fit items-center">
      <span className="absolute inset-0 rounded-[5px] opacity-30" style={{ backgroundColor: roleStyle.color }} />
      <span
        className={`relative m-0 inline-flex items-center font-semibold uppercase ${compact ? 'gap-1 rounded-[5px] px-1.5 py-0.5 text-[8px] tracking-[.5px]' : 'gap-1.5 rounded-lg px-2 py-[3px] text-[12px] tracking-[.8px] sm:text-[13px]'}`}
        style={{ color: roleStyle.color }}
      >
        {roleStyle.label}
        {roleStyle.image ? <img src={roleStyle.image} className={`${compact ? 'h-3.5 w-3.5' : 'h-[22px] w-[22px]'} object-contain`} alt="Role Icon" /> : null}
      </span>
    </span>
  )
}
