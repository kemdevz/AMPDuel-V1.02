const RECAPTCHA_SCRIPT_ID = 'google-recaptcha-script'
const RECAPTCHA_SCRIPT_SOURCES = [
  'https://www.google.com/recaptcha/api.js?render=explicit',
  'https://www.recaptcha.net/recaptcha/api.js?render=explicit',
]
export const RECAPTCHA_TEST_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'

let recaptchaLoadPromise = null

function waitForRecaptchaRender(timeoutMs = 15000) {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const checkReady = () => {
      if (typeof window.grecaptcha?.render === 'function') {
        resolve(window.grecaptcha)
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Google reCAPTCHA did not finish loading.'))
        return
      }

      window.setTimeout(checkReady, 50)
    }

    checkReady()
  })
}

function loadRecaptchaSource(source) {
  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID)
    if (existingScript) existingScript.remove()

    const script = document.createElement('script')
    script.id = RECAPTCHA_SCRIPT_ID
    script.src = source
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'

    const handleError = () => reject(new Error('Google reCAPTCHA failed to load.'))
    script.addEventListener('error', handleError, { once: true })
    document.head.appendChild(script)

    void waitForRecaptchaRender()
      .then(resolve)
      .catch(reject)
      .finally(() => script.removeEventListener('error', handleError))
  })
}

export function loadRecaptcha() {
  if (typeof window.grecaptcha?.render === 'function') {
    return Promise.resolve(window.grecaptcha)
  }

  if (recaptchaLoadPromise) return recaptchaLoadPromise

  recaptchaLoadPromise = (async () => {
    let lastError = null
    for (const source of RECAPTCHA_SCRIPT_SOURCES) {
      try {
        return await loadRecaptchaSource(source)
      } catch (error) {
        lastError = error
        document.getElementById(RECAPTCHA_SCRIPT_ID)?.remove()
      }
    }
    throw lastError || new Error('Google reCAPTCHA failed to load.')
  })().catch((error) => {
    recaptchaLoadPromise = null
    throw error
  })

  return recaptchaLoadPromise
}
