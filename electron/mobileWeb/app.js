// Shared across all mobile pages: keeps the theme/font in sync with the IDE,
// keeps the screen awake, and requests fullscreen on first touch.

function applyDisplay(theme, font) {
  if (theme) document.documentElement.dataset.theme = theme
  if (font) document.documentElement.style.setProperty('--font-mono', font)
}

let displayPollTimer = null

// Shown when a poll finds our session gone (device disconnected from the
// IDE side) — covers whatever page we're on so a stale usage screen etc.
// doesn't just sit there looking connected.
function showDisconnectedOverlay() {
  if (displayPollTimer) { clearInterval(displayPollTimer); displayPollTimer = null }
  if (document.getElementById('disconnected-overlay')) return
  const overlay = document.createElement('div')
  overlay.id = 'disconnected-overlay'
  overlay.className = 'disconnected-overlay'
  overlay.innerHTML =
    '<div style="text-align:center">'
    + '<h1 style="font-size:20px;font-weight:700">Disconnected</h1>'
    + '<p class="muted" style="margin-top:8px;font-size:14px">This device was disconnected from vIDE.</p>'
    + '<a href="/" class="btn" style="margin-top:20px;display:inline-block;text-decoration:none">Enter PIN</a>'
    + '</div>'
  document.body.appendChild(overlay)
}

function pollDisplay() {
  // redirect: 'manual' surfaces the auth gate's 302 as an opaqueredirect
  // response instead of silently following it and trying (and failing) to
  // parse the PIN page's HTML as JSON.
  fetch('/api/state', { redirect: 'manual' })
    .then((r) => {
      if (r.type === 'opaqueredirect') {
        if (location.pathname !== '/') showDisconnectedOverlay()
        return null
      }
      return r.json()
    })
    .then((s) => { if (s) applyDisplay(s.theme, s.font) })
    .catch(() => {})
}

// Wake Lock requires a secure context. The phone loads this page over plain
// http://<lan-ip>, which iOS Safari treats as insecure, so
// navigator.wakeLock silently fails there — this is why the screen used to
// keep sleeping. The canvas -> captureStream() -> hidden <video> trick keeps
// iOS awake without needing a secure context or any embedded media file.
function initNoSleep() {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    const stream = canvas.captureStream(1)
    const video = document.createElement('video')
    video.muted = true
    video.setAttribute('muted', '')
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
    video.srcObject = stream
    document.body.appendChild(video)
    setInterval(() => { ctx.fillRect(0, 0, 1, 1) }, 1000)
    const play = () => video.play().catch(() => {})
    play()
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') play() })
  } catch (e) { /* captureStream unsupported — nothing more we can do */ }

  if ('wakeLock' in navigator) {
    const request = () => navigator.wakeLock.request('screen').catch(() => {})
    request()
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') request() })
  }
}

function initFullscreenOnTap() {
  const fs = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen
  if (!fs) return
  document.addEventListener('touchstart', function h() {
    fs.call(document.documentElement)
    document.removeEventListener('touchstart', h)
  }, { once: true, passive: true })
}

pollDisplay()
displayPollTimer = setInterval(pollDisplay, 10000)
initNoSleep()
initFullscreenOnTap()
