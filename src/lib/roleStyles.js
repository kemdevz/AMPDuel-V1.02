const DEFAULT_ROLE = {
  label: 'User',
  color: 'rgb(108, 99, 255)',
  image: null,
}

const ROLE_STYLES = {
  vip: {
    label: 'VIP',
    color: 'rgb(229, 210, 47)',
    image: '/vip-HsPT3IkU.png',
    nameGradient: 'linear-gradient(90deg, rgb(229, 210, 47), rgb(255, 240, 125))',
  },
  staff: {
    label: 'Staff',
    color: 'rgb(239, 68, 68)',
    image: '/Staff.png',
    nameGradient: 'linear-gradient(90deg, rgb(239, 68, 68), rgb(252, 165, 165))',
  },
  moderator: {
    label: 'Moderator',
    color: 'rgb(0, 123, 255)',
    image: '/ModeratorBadge.png',
    nameGradient: 'linear-gradient(90deg, rgb(0, 123, 255), rgb(125, 211, 252))',
  },
  admin: {
    label: 'Admin',
    color: 'rgb(255, 94, 24)',
    image: '/admin-DSCODwnH.webp',
    nameGradient: 'linear-gradient(90deg, rgb(255, 94, 24), rgb(255, 183, 77))',
  },
  owner: {
    label: 'Owner',
    color: 'rgb(82, 82, 91)',
    image: '/Owner.png',
    nameGradient: 'linear-gradient(90deg, rgb(51, 51, 51), rgb(65, 65, 65))',
  },
}

export function getRoleStyle(role) {
  const normalizedRole = String(role || '').trim().toLowerCase()
  if (ROLE_STYLES[normalizedRole]) return ROLE_STYLES[normalizedRole]
  if (!normalizedRole || normalizedRole === 'user') return DEFAULT_ROLE

  return {
    ...DEFAULT_ROLE,
    label: normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1),
  }
}
