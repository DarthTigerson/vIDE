// Is a plain one-word repo or folder name an ordinary English word?
// Ordinary words ("core", "tools", "forum") stay visible: hiding them would
// also change normal text and code. Anything else ("zorbleton") is a
// made-up project name and gets hidden.
//
// Uses the word list every Mac ships (/usr/share/dict/words, ~236k words),
// so nothing extra is bundled. That list has base forms only and predates
// most tech words, so endings are stripped and a short tech list is added.
// Without the file (not a Mac), every plain name counts as a word: nothing
// new is hidden, which is the old behaviour.

import { readFileSync } from 'fs'

export const SYSTEM_WORDS = '/usr/share/dict/words'

// Common software words the system list lacks
const TECH_WORDS = `
api auth oauth sso saml jwt demo admin app backend frontend fullstack devops gitops sre infra ops
kubernetes docker podman helm kustomize argocd argo nginx traefik linkerd istio envoy ingress
redis postgres postgresql mysql mariadb mongo mongodb kafka rabbitmq elasticsearch opensearch
grafana prometheus alertmanager loki tempo signoz otel opentelemetry jaeger sentry datadog
terraform opentofu ansible jenkins gitlab github bitbucket jira confluence slack teams
webhook cronjob cron config repo monorepo cli sdk json yaml toml xml html css scss http https
url uri dns cdn ssl tls cert login logout signup signin dashboard chatbot bot blog wiki plugin
middleware microservice microservices serverless lambda kotlin typescript javascript golang
nodejs npm pnpm yarn webpack vite eslint prettier jest vitest playwright cypress storybook figma
ios android macos linux ubuntu debian alpine windows sitemap seo analytics staging prod dev qa
uat sandbox cms crm erp ecommerce checkout mailer newsletter scraper crawler parser scheduler
healthcheck uptime backend utils util lib libs readme changelog makefile dockerfile workflow
pipeline runbook playbook localhost subdomain hostname username email emails inbox
wordpress laravel django flask rails react vue angular nextjs nuxt svelte tailwind bootstrap
graphql grpc rest websocket websockets openapi swagger postman stripe paypal twilio
cloudflare azure aws gcp vercel netlify heroku digitalocean
`
  .split(/\s+/)
  .filter(Boolean)

// Base forms to try: tools -> tool, shared -> share, building -> build
function stems(w: string): string[] {
  const out = [w]
  const add = (s: string) => { if (s.length >= 3) out.push(s) }
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) add(w.slice(0, -2))
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1))
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)) }
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e') }
  if (w.endsWith('ers')) { add(w.slice(0, -3)); add(w.slice(0, -2)) }
  if (w.endsWith('er')) { add(w.slice(0, -2)); add(w.slice(0, -1)) }
  if (w.endsWith('ly')) add(w.slice(0, -2))
  return out
}

export class WordChecker {
  private words: Set<string> | null = null
  private missing = false
  private verdicts = new Map<string, boolean>()
  private releaseTimer: NodeJS.Timeout | null = null

  constructor(private path = SYSTEM_WORDS, private keepMs = 60_000) {}

  isWord(name: string): boolean {
    const w = name.toLowerCase()
    const cached = this.verdicts.get(w)
    if (cached !== undefined) return cached
    const words = this.load()
    // No word list: treat every name as a word, so nothing new is hidden
    const verdict = words === null ? true : stems(w).some((s) => words.has(s))
    this.verdicts.set(w, verdict)
    return verdict
  }

  // The list is large (about 10 MB in memory): it is loaded on demand and
  // dropped again shortly after; answers stay cached
  private load(): Set<string> | null {
    if (this.missing) return null
    if (!this.words) {
      try {
        const text = readFileSync(this.path, 'utf8')
        this.words = new Set(text.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean))
        for (const t of TECH_WORDS) this.words.add(t)
      } catch {
        this.missing = true
        return null
      }
    }
    if (this.releaseTimer) clearTimeout(this.releaseTimer)
    this.releaseTimer = setTimeout(() => { this.words = null; this.releaseTimer = null }, this.keepMs)
    this.releaseTimer.unref?.()
    return this.words
  }
}
