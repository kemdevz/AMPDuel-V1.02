let audioContext = null

function addTone(context, { frequency, endFrequency = frequency, duration, delay = 0, type = 'sine', gain = 0.035 }) {
  const start = context.currentTime + delay
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration)
  envelope.gain.setValueAtTime(Math.max(0.0001, gain), start)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope)
  envelope.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function playMinesSound(_name, { userGesture = false } = {}) {
  if (typeof window === 'undefined') return
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return
  if (!audioContext) {
    if (!userGesture) return
    audioContext = new AudioContext()
  }

  const play = () => {
    if (!audioContext || audioContext.state !== 'running') return
    addTone(audioContext, { frequency: 430, endFrequency: 610, duration: 0.1, type: 'sine', gain: 0.027 })
    addTone(audioContext, { frequency: 680, endFrequency: 760, duration: 0.09, delay: 0.055, type: 'sine', gain: 0.018 })
  }

  if (audioContext.state === 'suspended') {
    if (!userGesture) return
    void audioContext.resume().then(play).catch(() => {})
    return
  }
  play()
}
