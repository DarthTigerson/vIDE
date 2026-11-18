import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createServer, get } from 'https'
import { loadOrCreateMobileTls, needsNewServerCert, certFingerprint } from '../mobileTls'

const dirs: string[] = []
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'vide-mobile-tls-'))
  dirs.push(d)
  return d
}
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

function fetchWithCa(port: number, ca: string): Promise<number> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path: '/', ca, agent: false }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    }).on('error', reject)
  })
}

describe('loadOrCreateMobileTls', () => {
  it('serves HTTPS that verifies against the vIDE CA for a covered IP', async () => {
    const tls = loadOrCreateMobileTls(tempDir(), ['192.168.1.50'])
    const server = createServer({ key: tls.key, cert: tls.cert }, (_req, res) => { res.end('ok') })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as { port: number }).port
    try {
      expect(await fetchWithCa(port, tls.caCert)).toBe(200)
      // Without the CA the certificate is not trusted.
      await expect(new Promise((resolve, reject) => {
        get({ host: '127.0.0.1', port, path: '/', agent: false }, resolve).on('error', reject)
      })).rejects.toThrow()
    } finally {
      server.close()
    }
  }, 30_000)

  it('reuses stored certificates while they cover the addresses', () => {
    const dir = tempDir()
    const a = loadOrCreateMobileTls(dir, ['10.0.0.2'])
    const b = loadOrCreateMobileTls(dir, ['10.0.0.2'])
    expect(b.fingerprint).toBe(a.fingerprint)
    expect(b.caCert).toBe(a.caCert)
  }, 30_000)

  it('makes a new server certificate, same CA, for a new address and keeps the old one covered', () => {
    const dir = tempDir()
    const a = loadOrCreateMobileTls(dir, ['10.0.0.2'])
    const b = loadOrCreateMobileTls(dir, ['192.168.7.9'])
    expect(b.fingerprint).not.toBe(a.fingerprint)
    expect(b.caCert).toBe(a.caCert)
    const meta = JSON.parse(readFileSync(join(dir, 'server-cert.json'), 'utf8'))
    expect(meta.addresses).toEqual(expect.arrayContaining(['127.0.0.1', '10.0.0.2', '192.168.7.9']))
    // Switching back doesn't replace it again.
    expect(loadOrCreateMobileTls(dir, ['10.0.0.2']).fingerprint).toBe(b.fingerprint)
  }, 30_000)

  it('keeps private keys readable only by the user', () => {
    const dir = tempDir()
    loadOrCreateMobileTls(dir, [])
    for (const f of ['ca-key.pem', 'server-key.pem']) {
      expect(statSync(join(dir, f)).mode & 0o077).toBe(0)
    }
  }, 30_000)

  it('formats the fingerprint as colon-separated SHA-256 hex', () => {
    const tls = loadOrCreateMobileTls(tempDir(), [])
    expect(tls.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    expect(certFingerprint(tls.cert)).toBe(tls.fingerprint)
  }, 30_000)
})

describe('needsNewServerCert', () => {
  const now = Date.UTC(2026, 10, 18)
  const far = now + 300 * 24 * 60 * 60_000
  it('renews when missing, near expiry, or an address is not covered', () => {
    expect(needsNewServerCert(null, ['1.2.3.4'], now)).toBe(true)
    expect(needsNewServerCert({ addresses: ['1.2.3.4'], notAfter: now + 1000 }, ['1.2.3.4'], now)).toBe(true)
    expect(needsNewServerCert({ addresses: ['1.2.3.4'], notAfter: far }, ['5.6.7.8'], now)).toBe(true)
    expect(needsNewServerCert({ addresses: ['1.2.3.4', '5.6.7.8'], notAfter: far }, ['5.6.7.8'], now)).toBe(false)
  })
})
