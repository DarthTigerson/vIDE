import '@testing-library/jest-dom/vitest'

if (typeof window !== 'undefined' && !(window as any).ResizeObserver) {
  ;(window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (typeof window !== 'undefined' && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {}
}

// Some jsdom configurations expose a window without a working Storage
// implementation, which crashes every store that reads localStorage at
// module-load time. Provide an in-memory fallback only when the real thing
// is absent — never override a working implementation.
if (typeof window !== 'undefined' && !window.localStorage) {
  const makeStorage = () => {
    const map = new Map<string, string>()
    return {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => { map.set(k, String(v)) },
      removeItem: (k: string) => { map.delete(k) },
      clear: () => { map.clear() },
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() { return map.size },
    }
  }
  ;(window as any).localStorage = makeStorage()
  ;(window as any).sessionStorage = makeStorage()
  ;(globalThis as any).localStorage = (window as any).localStorage
  ;(globalThis as any).sessionStorage = (window as any).sessionStorage
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}
