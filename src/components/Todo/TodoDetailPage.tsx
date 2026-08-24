import { useState } from 'react'
import { useTodoStore, EMPTY_TODOS } from '@/stores/todoStore'
import { getProjectTags } from '@/lib/todoTags'
import { TODO_COLUMNS } from '@/lib/todoBoard'
import { ArchiveIcon } from './ArchiveIcon'
import { AttachmentThumbnails } from './AttachmentThumbnails'
import { TODO_LABELS, TODO_LABEL_META } from './labels'
import { TodoTagInput } from './TodoTagInput'
import { inputClass, uploadPastedImages } from './todoFormShared'
import type { TodoLabel, TodoStatus } from '@/types/api'

export function TodoDetailPage({ projectId, todoId }: { projectId: string; todoId: string }) {
  const todo = useTodoStore((s) => s.todosByProject[projectId]?.find((t) => t.id === todoId))
  const project = useTodoStore((s) => s.projects.find((p) => p.id === projectId))
  const updateTodo = useTodoStore((s) => s.updateTodo)
  const archiveTodo = useTodoStore((s) => s.archiveTodo)
  const addComment = useTodoStore((s) => s.addComment)
  const saveAttachment = useTodoStore((s) => s.saveAttachment)
  const projectTodos = useTodoStore((s) => s.todosByProject[projectId] ?? EMPTY_TODOS)
  const tagSuggestions = getProjectTags(projectTodos)

  const [title, setTitle] = useState(todo?.title ?? '')
  const [description, setDescription] = useState(todo?.description ?? '')
  const [prUrl, setPrUrl] = useState(todo?.prUrl ?? '')
  const [commentBody, setCommentBody] = useState('')
  const [commentAttachments, setCommentAttachments] = useState<string[]>([])

  if (!todo) {
    return <div className="h-full bg-panel" />
  }

  function handleLabelChange(value: string) {
    updateTodo(todo!.id, { label: value === '' ? null : (value as TodoLabel) })
  }

  function handleStatusChange(value: TodoStatus) {
    updateTodo(todo!.id, { status: value })
  }

  async function handleDescriptionPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const ids = await uploadPastedImages(e.clipboardData, saveAttachment)
    if (ids.length > 0) updateTodo(todo!.id, { attachments: [...todo!.attachments, ...ids] })
  }

  async function handleCommentPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const ids = await uploadPastedImages(e.clipboardData, saveAttachment)
    if (ids.length > 0) setCommentAttachments((prev) => [...prev, ...ids])
  }

  async function handleAddComment() {
    if (!commentBody.trim()) return
    await addComment(todo!.id, commentBody.trim(), commentAttachments)
    setCommentBody('')
    setCommentAttachments([])
  }

  return (
    <div className="h-full overflow-y-auto bg-panel p-8">
      <div className="flex flex-col gap-4 max-w-6xl mx-auto">
        <span className="text-xs font-mono text-fg-subtle">
          <span>{project?.name ?? 'Todo'}</span>
          <span className="text-fg-subtle/50"> &gt; </span>
          <span>{todo.id}</span>
        </span>

        <div className="flex gap-10 items-start">
          <div className="flex-1 min-w-0 max-w-3xl flex flex-col gap-4">
            <label htmlFor="todo-title" className="flex flex-col gap-1 text-xs text-fg-muted">
              Title
              <input
                id="todo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title !== todo.title) updateTodo(todo.id, { title })
                }}
                className={`${inputClass} text-lg font-medium`}
              />
            </label>

            <label htmlFor="todo-description" className="flex flex-col gap-1 text-xs text-fg-muted">
              Description
              <textarea
                id="todo-description"
                rows={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== todo.description) updateTodo(todo.id, { description })
                }}
                onPaste={handleDescriptionPaste}
                className={inputClass}
              />
            </label>
            <AttachmentThumbnails
              attachments={todo.attachments}
              onRemove={(id) =>
                updateTodo(todo.id, { attachments: todo.attachments.filter((a) => a !== id) })
              }
            />

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Comments</h3>
              {todo.comments.map((comment) => (
                <div key={comment.id} className="flex flex-col gap-1 rounded border border-border/60 p-2">
                  <p className="text-sm text-fg whitespace-pre-wrap">{comment.body}</p>
                  <AttachmentThumbnails attachments={comment.attachments} />
                </div>
              ))}
              <label htmlFor="todo-new-comment" className="sr-only">
                New comment
              </label>
              <textarea
                id="todo-new-comment"
                rows={2}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onPaste={handleCommentPaste}
                placeholder="Add a comment…"
                className={inputClass}
              />
              <AttachmentThumbnails
                attachments={commentAttachments}
                onRemove={(id) => setCommentAttachments((prev) => prev.filter((a) => a !== id))}
              />
              <button
                type="button"
                onClick={handleAddComment}
                disabled={!commentBody.trim()}
                className="self-end px-3 py-1.5 rounded text-sm bg-accent text-on-accent hover:bg-accent/90 disabled:opacity-40 disabled:pointer-events-none"
              >
                Add Comment
              </button>
            </div>
          </div>

          <div className="w-72 flex-shrink-0 flex flex-col gap-4">
            <label htmlFor="todo-status" className="flex flex-col gap-1 text-xs text-fg-muted">
              Status
              <select
                id="todo-status"
                value={todo.status}
                onChange={(e) => handleStatusChange(e.target.value as TodoStatus)}
                className={inputClass}
              >
                {TODO_COLUMNS.map((col) => (
                  <option key={col.status} value={col.status}>
                    {col.title}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="todo-label" className="flex flex-col gap-1 text-xs text-fg-muted">
              Label
              <select
                id="todo-label"
                value={todo.label ?? ''}
                onChange={(e) => handleLabelChange(e.target.value)}
                className={inputClass}
              >
                <option value="">No label</option>
                {TODO_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {TODO_LABEL_META[label].text}
                  </option>
                ))}
              </select>
            </label>

            <TodoTagInput
              tags={todo.tags}
              suggestions={tagSuggestions}
              onChange={(tags) => updateTodo(todo.id, { tags })}
            />

            <label htmlFor="todo-pr-url" className="flex flex-col gap-1 text-xs text-fg-muted">
              PR/MR URL
              <input
                id="todo-pr-url"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                onBlur={() => {
                  if (prUrl !== (todo.prUrl ?? '')) updateTodo(todo.id, { prUrl: prUrl || null })
                }}
                className={inputClass}
              />
            </label>

            <div className="pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => archiveTodo(todo.id, !todo.archived)}
                aria-label={todo.archived ? 'Unarchive' : 'Archive'}
                title={todo.archived ? 'Unarchive' : 'Archive'}
                className="text-fg-muted hover:text-fg"
              >
                <ArchiveIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
