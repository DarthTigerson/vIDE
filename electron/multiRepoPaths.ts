import { discoverRepos } from './git'

// In a project folder holding several git repos, a path relative to one repo
// ("helm-charts/x.yaml") can't be told apart from the same path in another
// repo or at the project root, so chat file links open the wrong file or
// nothing. Asking the model for absolute paths sidesteps the guessing: those
// resolve exactly. Only added when the project really has several repos, so
// single-repo replies keep their short paths.
export const MULTI_REPO_PATHS_PROMPT =
  'This project folder contains several git repositories. Whenever you mention a file to the user, ' +
  'always write its full absolute path, never a path relative to one repository or to the project folder.'

export async function isMultiRepoProject(root: string): Promise<boolean> {
  try {
    return (await discoverRepos(root)).length > 1
  } catch {
    return false
  }
}
