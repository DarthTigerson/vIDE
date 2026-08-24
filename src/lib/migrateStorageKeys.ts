// One-time migration for users upgrading from Huginn: every persisted
// setting was stored under a 'huginn:' localStorage key prefix. Copy each
// one to its 'vide:' equivalent (without deleting the original, so this is
// safe to run on every launch) before any store reads its key. Must be the
// first import in main.tsx so it runs before any store module's top-level
// localStorage reads.
const OLD_PREFIX = 'huginn:'
const NEW_PREFIX = 'vide:'

const originalLength = localStorage.length
for (let i = 0; i < originalLength; i++) {
  const key = localStorage.key(i)
  if (!key || !key.startsWith(OLD_PREFIX)) continue

  const newKey = NEW_PREFIX + key.slice(OLD_PREFIX.length)
  if (localStorage.getItem(newKey) === null) {
    localStorage.setItem(newKey, localStorage.getItem(key)!)
  }
}
