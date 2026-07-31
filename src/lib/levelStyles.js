export function getLevelStyle(level) {
  if (level >= 150) {
    return {
      color: 'rgb(251, 146, 60)',
      borderLeft: '2px solid rgb(251, 146, 60)',
      background:
        'linear-gradient(225deg, rgba(253, 186, 116, 0.3), rgba(249, 115, 22, 0.3), rgba(253, 186, 116, 0.3))',
    }
  }

  if (level >= 130) {
    return {
      color: 'rgb(244, 114, 182)',
      borderLeft: '2px solid rgb(244, 114, 182)',
      background:
        'linear-gradient(225deg, rgba(249, 168, 212, 0.28), rgba(236, 72, 153, 0.28), rgba(249, 168, 212, 0.28))',
    }
  }

  if (level >= 100) {
    return {
      color: 'rgb(217, 70, 239)',
      borderLeft: '2px solid rgb(217, 70, 239)',
      background:
        'linear-gradient(225deg, rgba(240, 171, 252, 0.28), rgba(192, 38, 211, 0.28), rgba(240, 171, 252, 0.28))',
    }
  }

  if (level >= 75) {
    return {
      color: 'rgb(129, 140, 248)',
      borderLeft: '2px solid rgb(129, 140, 248)',
      background:
        'linear-gradient(225deg, rgba(165, 180, 252, 0.28), rgba(99, 102, 241, 0.28), rgba(165, 180, 252, 0.28))',
    }
  }

  return {
    color: 'rgb(52, 211, 153)',
    borderLeft: '2px solid rgb(52, 211, 153)',
    background:
      'linear-gradient(225deg, rgba(110, 231, 183, 0.3), rgba(16, 185, 129, 0.3), rgba(110, 231, 183, 0.3))',
  }
}
