const HCAPTCHA_SCRIPT_ID = 'hcaptcha-script'
const HCAPTCHA_ONLOAD_CALLBACK = '__bloxdiceHcaptchaLoaded'

export const HCAPTCHA_TEST_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001'

let hcaptchaLoadPromise = null

function waitForHcaptcha(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const check = () => {
      if (typeof window.hcaptcha?.render === 'function') {
        resolve(window.hcaptcha)
        return
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('hCaptcha did not finish loading.'))
        return
      }
      window.setTimeout(check, 50)
    }
    check()
  })
}

export function loadHcaptcha() {
  if (typeof window.hcaptcha?.render === 'function') return Promise.resolve(window.hcaptcha)
  if (hcaptchaLoadPromise) return hcaptchaLoadPromise

  hcaptchaLoadPromise = new Promise((resolve, reject) => {
    const finish = () => {
      void waitForHcaptcha().then(resolve).catch(reject)
    }

    window[HCAPTCHA_ONLOAD_CALLBACK] = finish
    const existingScript = document.getElementById(HCAPTCHA_SCRIPT_ID)
    if (existingScript) {
      finish()
      return
    }

    const script = document.createElement('script')
    script.id = HCAPTCHA_SCRIPT_ID
    script.async = true
    script.defer = true
    script.src = `https://js.hcaptcha.com/1/api.js?onload=${HCAPTCHA_ONLOAD_CALLBACK}&render=explicit&recaptchacompat=off`
    script.onerror = () => reject(new Error('hCaptcha failed to load.'))
    document.head.appendChild(script)
  }).catch((error) => {
    hcaptchaLoadPromise = null
    throw error
  })

  return hcaptchaLoadPromise
}
