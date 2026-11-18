// TLS for the Mobile Display server, so pairing PINs, session cookies and
// relayed terminal traffic can't be read by anyone else on the network.
//
// vIDE acts as its own tiny certificate authority: a CA key and certificate
// made once per machine, and a server certificate signed by it that names
// every LAN address the server may be reached on. Phones see the usual
// "not private" warning the first time (the CA isn't trusted by them), and
// the desktop panel shows the server certificate's fingerprint so it can be
// compared before accepting. A phone that installs the CA certificate
// (served at /vide-ca.crt) gets no warning at all and rejects any other
// certificate, including one an attacker presents.
//
// Everything lives in userData/mobile-tls, which vIDE Sync never copies: each
// machine keeps its own private keys.
//
// Keys are made with Node's native crypto (fast); node-forge only assembles
// and signs the X.509 certificates, which Node has no API for.
import { createHash, generateKeyPairSync, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { hostname } from 'os'
import { join } from 'path'
import forge from 'node-forge'

export interface MobileTls {
  key: string
  cert: string
  caCert: string
  // SHA-256 of the server certificate, colon-separated uppercase hex — the
  // form browsers show in their certificate details.
  fingerprint: string
}

interface ServerCertMeta {
  addresses: string[]
  notAfter: number
}

const CA_VALID_YEARS = 10
// Apple only trusts server certificates from user-installed CAs for up to
// 825 days; stay well inside that.
const SERVER_VALID_DAYS = 397
// Renew the server certificate this long before it expires.
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000
// Earlier addresses (other networks) kept in a renewed certificate.
const MAX_KEPT_ADDRESSES = 16

function newRsaKeyPair(): { privatePem: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { privatePem: privateKey, publicPem: publicKey }
}

// A positive random serial; the leading byte is masked so DER doesn't read it
// as negative.
function randomSerial(): string {
  const bytes = randomBytes(16)
  bytes[0] &= 0x7f
  return bytes.toString('hex')
}

function caSubject(): forge.pki.CertificateField[] {
  return [
    { name: 'commonName', value: `vIDE Local CA (${hostname()})` },
    { name: 'organizationName', value: 'vIDE' },
  ]
}

export function createCa(now: Date = new Date()): { keyPem: string; certPem: string } {
  const { privatePem, publicPem } = newRsaKeyPair()
  const cert = forge.pki.createCertificate()
  cert.publicKey = forge.pki.publicKeyFromPem(publicPem)
  cert.serialNumber = randomSerial()
  cert.validity.notBefore = new Date(now.getTime() - DAY_MS)
  cert.validity.notAfter = new Date(now.getTime())
  cert.validity.notAfter.setFullYear(now.getFullYear() + CA_VALID_YEARS)
  cert.setSubject(caSubject())
  cert.setIssuer(caSubject())
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ])
  cert.sign(forge.pki.privateKeyFromPem(privatePem), forge.md.sha256.create())
  return { keyPem: privatePem, certPem: forge.pki.certificateToPem(cert) }
}

export function createServerCert(
  ca: { keyPem: string; certPem: string },
  addresses: string[],
  now: Date = new Date(),
): { keyPem: string; certPem: string; notAfter: number } {
  const caCert = forge.pki.certificateFromPem(ca.certPem)
  const { privatePem, publicPem } = newRsaKeyPair()
  const cert = forge.pki.createCertificate()
  cert.publicKey = forge.pki.publicKeyFromPem(publicPem)
  cert.serialNumber = randomSerial()
  cert.validity.notBefore = new Date(now.getTime() - DAY_MS)
  cert.validity.notAfter = new Date(now.getTime() + SERVER_VALID_DAYS * DAY_MS)
  const host = hostname()
  cert.setSubject([{ name: 'commonName', value: 'vIDE Mobile Display' }])
  cert.setIssuer(caCert.subject.attributes)
  const altNames = [
    ...addresses.map((ip) => ({ type: 7, ip })),
    { type: 2, value: 'localhost' },
    ...(host ? [{ type: 2, value: host.endsWith('.local') ? host : `${host}.local` }] : []),
  ]
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: caCert.generateSubjectKeyIdentifier().getBytes() },
  ])
  cert.sign(forge.pki.privateKeyFromPem(ca.keyPem), forge.md.sha256.create())
  return { keyPem: privatePem, certPem: forge.pki.certificateToPem(cert), notAfter: cert.validity.notAfter.getTime() }
}

export function certFingerprint(certPem: string): string {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(certPem))).getBytes()
  const hex = createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex').toUpperCase()
  return hex.match(/../g)!.join(':')
}

// Whether the stored server certificate can't serve these addresses (or is
// close to expiring) and has to be made again.
export function needsNewServerCert(meta: ServerCertMeta | null, addresses: string[], now: number = Date.now()): boolean {
  if (!meta) return true
  if (meta.notAfter - now < RENEW_BEFORE_MS) return true
  const covered = new Set(meta.addresses)
  return addresses.some((a) => !covered.has(a))
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function writePrivate(path: string, data: string): void {
  writeFileSync(path, data, { mode: 0o600 })
}

// Loads the CA and a server certificate covering `addresses` from `dir`,
// making whichever is missing, stale or doesn't cover an address.
export function loadOrCreateMobileTls(dir: string, addresses: string[], now: Date = new Date()): MobileTls {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const caKeyPath = join(dir, 'ca-key.pem')
  const caCertPath = join(dir, 'ca-cert.pem')
  const keyPath = join(dir, 'server-key.pem')
  const certPath = join(dir, 'server-cert.pem')
  const metaPath = join(dir, 'server-cert.json')

  let ca: { keyPem: string; certPem: string }
  let caIsNew = false
  const caValid = existsSync(caKeyPath) && existsSync(caCertPath) && (() => {
    try {
      return forge.pki.certificateFromPem(readFileSync(caCertPath, 'utf8')).validity.notAfter.getTime() - now.getTime() > RENEW_BEFORE_MS
    } catch {
      return false
    }
  })()
  if (caValid) {
    ca = { keyPem: readFileSync(caKeyPath, 'utf8'), certPem: readFileSync(caCertPath, 'utf8') }
  } else {
    ca = createCa(now)
    writePrivate(caKeyPath, ca.keyPem)
    writeFileSync(caCertPath, ca.certPem)
    caIsNew = true
  }

  // Keep every address the current certificate already covers, so switching
  // between interfaces (or a Wi-Fi network coming back) doesn't keep
  // replacing it — a new certificate means a new warning on the phone.
  const meta = readJson<ServerCertMeta>(metaPath)
  const wanted = [...new Set(['127.0.0.1', ...addresses])]
  if (caIsNew || !existsSync(keyPath) || !existsSync(certPath) || needsNewServerCert(meta, wanted, now.getTime())) {
    const kept = (meta?.addresses ?? []).filter((a) => !wanted.includes(a)).slice(-MAX_KEPT_ADDRESSES)
    const all = [...kept, ...wanted]
    const server = createServerCert(ca, all, now)
    writePrivate(keyPath, server.keyPem)
    writeFileSync(certPath, server.certPem)
    writeFileSync(metaPath, JSON.stringify({ addresses: all, notAfter: server.notAfter } satisfies ServerCertMeta))
  }

  const cert = readFileSync(certPath, 'utf8')
  return { key: readFileSync(keyPath, 'utf8'), cert, caCert: ca.certPem, fingerprint: certFingerprint(cert) }
}
