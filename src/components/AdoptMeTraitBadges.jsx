const TRAIT_ORDER = Object.freeze(['M', 'N', 'F', 'R'])

export function getAdoptMeTraits(name = '') {
  const prefix = String(name).trim().split(/\s+/)[0]?.toUpperCase() || ''
  if (!/^[MFRN]+$/.test(prefix)) return []
  return TRAIT_ORDER.filter((trait) => prefix.includes(trait))
}

export default function AdoptMeTraitBadges({ item, className = '' }) {
  const traits = getAdoptMeTraits(item?.name)
  if (traits.length === 0) return null

  return (
    <span className={`adopt-me-traits${className ? ` ${className}` : ''}`} aria-label={traits.join(', ')}>
      {traits.map((trait) => (
        <span className={`adopt-me-trait adopt-me-trait--${trait.toLowerCase()}`} key={trait} aria-hidden="true">
          {trait}
        </span>
      ))}
    </span>
  )
}
