import { useGeneralSettingsStore, type FileTreeGitStatus } from '@/stores/generalSettingsStore'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { FileTreePreview } from './previews/fileTreePreviews'
import { HiddenFoldersList } from './HiddenFolderControls'

export function FileTreeSettingsPage() {
  const fileTreeGitStatus = useGeneralSettingsStore((s) => s.fileTreeGitStatus)
  const setFileTreeGitStatus = useGeneralSettingsStore((s) => s.setFileTreeGitStatus)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Site Tree</h1>
        <p className="mb-4 text-sm text-fg-muted">How the file tree shows your project's files.</p>

        <FeatureBlock
          title="Git status"
          description="Mark changed files with their git status letter (M, A, D, R or U), and optionally colour the file name and its folders to match."
          preview={<FileTreePreview />}
        >
          <SettingRow label="Show">
            <RadioGroup<FileTreeGitStatus>
              ariaLabel="Git status in file tree"
              value={fileTreeGitStatus}
              onChange={setFileTreeGitStatus}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'letter', label: 'Letter' },
                { value: 'letterAndColour', label: 'Letter + Colour' },
              ]}
            />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Hidden folders"
          description="Hide folders that tools create in your project from the file tree (the files stay on disk), and add them to the project's .gitignore where that makes sense."
        >
          <HiddenFoldersList />
        </FeatureBlock>
      </div>
    </div>
  )
}
