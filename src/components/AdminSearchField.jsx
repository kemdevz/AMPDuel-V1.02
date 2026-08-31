export default function AdminSearchField({ value, onChange, onFocus, placeholder, className = '' }) {
  return (
    <label className={`relative block min-w-0 flex-1 ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-white/[.07] bg-[#25263B] py-1.5 pl-8 pr-2.5 text-[11px] text-white opacity-90 outline-none placeholder:text-[#858c99] focus:border-[#804AFF]"
      />
      <svg className="pointer-events-none absolute left-2.5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#747b89]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.4" />
        <path d="m16.2 16.2 4.1 4.1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </label>
  )
}
