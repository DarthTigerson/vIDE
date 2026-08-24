export function UndoToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-popover border border-border shadow-lg shadow-black/40 text-xs text-fg">
      <span className="truncate">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="shrink-0 font-medium text-accent hover:underline"
      >
        Undo
      </button>
    </div>
  )
}
