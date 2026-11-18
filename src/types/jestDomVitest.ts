// @testing-library/jest-dom 7's own `vitest` types augment `Assertion<T>`
// with a single type parameter, but vitest 4+ declares `Assertion<R, T>`, so
// that augmentation no longer merges and every `toBeInTheDocument()` etc. is
// a type error. Vitest's documented extension point is `Matchers<R, T>` —
// extend that instead. Drop this file once jest-dom ships vitest 4+ types.
// (A .ts module rather than .d.ts because src/**/*.d.ts is gitignored.)
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<any, R> {}
}
