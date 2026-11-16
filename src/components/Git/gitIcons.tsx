// Line icons for the Git panel's buttons and the Graph / Branch Diff tabs.
// Drawn in currentColor at the size given, like the Todo panel's Trash icon.

type IconProps = { size?: number; className?: string }

function Icon({ size = 12, className = 'shrink-0', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

export function CheckoutIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <path d="M6 7.2v9.6M18 9.2c0 5-12 2.5-12 7.6" />
    </Icon>
  )
}

export function PullIcon(p: IconProps) {
  return <Icon {...p}><path d="M12 3v12M7 10l5 5 5-5M4 19h16" /></Icon>
}

export function PushIcon(p: IconProps) {
  return <Icon {...p}><path d="M12 15V3M7 8l5-5 5 5M4 19h16" /></Icon>
}

// Publish creates the branch on the remote: an upload into a cloud.
export function PublishIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5" />
      <path d="M12 21v-8M9 15.5l3-3 3 3" />
    </Icon>
  )
}

export function GitFunctionsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M11.7 3.3a4 4 0 0 0 5 5L18 10l-8 8-3-3 8-8z" />
      <path d="M3 21l5.5-5.5" />
    </Icon>
  )
}

// A branch forking off the main line and merging back.
export function GitGraphIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 3v18" />
      <path d="M6 7c0 4 12 2 12 6v1" />
      <circle cx="18" cy="17" r="2.5" />
      <circle cx="6" cy="12" r="2.5" fill="currentColor" />
    </Icon>
  )
}

// Two branch tips compared.
export function BranchDiffIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M6 8.5V15a3 3 0 0 0 3 3h4" />
      <path d="M11 15.5 13.5 18 11 20.5" />
      <path d="M18 15.5V9a3 3 0 0 0-3-3h-4" />
      <path d="M13 8.5 10.5 6 13 3.5" />
    </Icon>
  )
}
