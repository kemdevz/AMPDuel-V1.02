export function getLevelStyle(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1))

  if (safeLevel >= 200) {
    return {
      color: '#FB923C',
      borderLeft: '2px solid #FB923C',
      background:
        'linear-gradient(225deg, rgba(253, 186, 116, 0.3), rgba(249, 115, 22, 0.3), rgba(253, 186, 116, 0.3))',
    }
  }

  if (safeLevel >= 175) {
    return {
      color: '#EF4444',
      borderLeft: '2px solid #EF4444',
      background: 'linear-gradient(225deg, #573940, #4F1C23, #573940)',
    }
  }

  if (safeLevel >= 150) {
    return {
      color: '#FB923C',
      borderLeft: '2px solid #FB923C',
      background: 'linear-gradient(225deg, #594131, #583420, #594131)',
    }
  }

  if (safeLevel >= 130) {
    return {
      color: 'rgb(244, 114, 182)',
      borderLeft: '2px solid rgb(244, 114, 182)',
      background:
        'linear-gradient(225deg, rgba(249, 168, 212, 0.28), rgba(236, 72, 153, 0.28), rgba(249, 168, 212, 0.28))',
    }
  }

  if (safeLevel >= 100) {
    return {
      color: '#D946EF',
      borderLeft: '2px solid #D946EF',
      background: 'linear-gradient(225deg, #4C3359, #451D53, #4C3359)',
    }
  }

  if (safeLevel >= 75) {
    return {
      color: '#818CF8',
      borderLeft: '2px solid #818CF8',
      background: 'linear-gradient(225deg, #363A5C, #2B2D5A, #363A5C)',
    }
  }

  if (safeLevel >= 50) {
    return {
      color: '#22D3EE',
      borderLeft: '2px solid #22D3EE',
      background: '#134353',
    }
  }

  if (safeLevel >= 25) {
    return {
      color: '#34D399',
      borderLeft: '2px solid #34D399',
      background: '#13473E',
    }
  }

  return {
    color: '#9CA3AF',
    borderLeft: '2px solid #9CA3AF',
    background: '#2D303D',
  }
}
