const RECAPTCHA_SCRIPT_ID = 'google-recaptcha-script'
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

export function loadRecaptcha() {
  if (typeof window.grecaptcha?.render === 'function') {
    return Promise.resolve(window.grecaptcha)
  }

  if (recaptchaLoadPromise) return recaptchaLoadPromise

  recaptchaLoadPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(RECAPTCHA_SCRIPT_ID)

    if (!script) {
      script = document.createElement('script')
      script.id = RECAPTCHA_SCRIPT_ID
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    const handleError = () => reject(new Error('Google reCAPTCHA failed to load.'))
    script.addEventListener('error', handleError, { once: true })

    void waitForRecaptchaRender()
      .then(resolve)
      .catch(reject)
      .finally(() => script.removeEventListener('error', handleError))
  }).catch((error) => {
    recaptchaLoadPromise = null
    throw error
  })

  return recaptchaLoadPromise
}
