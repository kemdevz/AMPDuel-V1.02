const SOUND_VOLUME_KEY = 'bloxdice:sound-volume'

let audioContext = null

export function getSoundVolume() {
  if (typeof window === 'undefined') return 100
  try {
    const stored = Number(window.localStorage.getItem(SOUND_VOLUME_KEY))
    return Number.isFinite(stored) ? Math.min(100, Math.max(0, stored)) : 100
  } catch {
    return 100
  }
}

export function setSoundVolume(value) {
  const volume = Math.min(100, Math.max(0, Number(value) || 0))
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(SOUND_VOLUME_KEY, String(volume)) } catch { /* Storage may be unavailable. */ }
  }
  return volume
}

function addTone(context, volume, { frequency, endFrequency = frequency, duration, delay = 0, type = 'sine', gain = 0.035 }) {
  const start = context.currentTime + delay
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration)
  envelope.gain.setValueAtTime(Math.max(0.0001, gain * volume), start)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope)
  envelope.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function playMinesSound(name, { userGesture = false } = {}) {
  if (typeof window === 'undefined') return
  const volume = getSoundVolume() / 100
  if (volume <= 0) return

  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return
  if (!audioContext) {
    if (!userGesture) return
    audioContext = new AudioContext()
  }

  const play = () => {
    if (!audioContext || audioContext.state !== 'running') return
    if (name === 'select') {
      addTone(audioContext, volume, { frequency: 210, endFrequency: 150, duration: 0.055, type: 'square', gain: 0.018 })
    } else if (name === 'safe') {
      addTone(audioContext, volume, { frequency: 430, endFrequency: 580, duration: 0.11, gain: 0.03 })
      addTone(audioContext, volume, { frequency: 650, endFrequency: 760, duration: 0.12, delay: 0.065, gain: 0.025 })
    } else if (name === 'mine') {
      addTone(audioContext, volume, { frequency: 145, endFrequency: 48, duration: 0.3, type: 'sawtooth', gain: 0.04 })
    } else if (name === 'turn') {
      addTone(audioContext, volume, { frequency: 520, endFrequency: 610, duration: 0.09, gain: 0.022 })
      addTone(audioContext, volume, { frequency: 760, endFrequency: 850, duration: 0.11, delay: 0.08, gain: 0.02 })
    }
  }

  if (audioContext.state === 'suspended') {
    if (!userGesture) return
    void audioContext.resume().then(play).catch(() => {})
    return
  }
  play()
}
