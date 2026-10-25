export const PROSE_CLASSES = [
  'mx-auto max-w-3xl px-8 py-6 text-sm text-fg',
  '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:border-b [&_h1]:border-border [&_h1]:pb-2',
  '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1',
  '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2',
  '[&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2',
  '[&_h5]:text-sm [&_h5]:font-semibold [&_h5]:mt-3 [&_h5]:mb-1',
  '[&_h6]:text-sm [&_h6]:font-semibold [&_h6]:text-fg-muted [&_h6]:mt-3 [&_h6]:mb-1',
  '[&_p]:mb-3 [&_p]:leading-relaxed',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3',
  '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3',
  '[&_li]:mb-1',
  '[&_li>ul]:mt-1 [&_li>ul]:mb-0 [&_li>ol]:mt-1 [&_li>ol]:mb-0',
  // GFM task lists: drop the bullet so the checkbox stands in for it.
  '[&_.contains-task-list]:list-none [&_.contains-task-list]:pl-1',
  '[&_.task-list-item_input]:mr-2 [&_.task-list-item_input]:align-middle',
  '[&_a]:text-accent [&_a]:underline',
  '[&_del]:text-fg-muted',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_blockquote]:mb-3',
  '[&_code]:bg-white/10 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  '[&_pre]:bg-white/5 [&_pre]:rounded [&_pre]:p-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  // Tables follow VS Code / GitHub's markdown.css: sized to their content,
  // scrolling sideways rather than squashing columns when wider than the
  // page, a shaded header row and zebra-striped body rows. Column alignment
  // from the `:---:` row arrives as an inline text-align style, which wins
  // over the text-left default here.
  '[&_table]:block [&_table]:w-max [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:mb-4',
  '[&_th]:border [&_th]:border-border [&_th]:bg-white/5 [&_th]:px-3 [&_th]:py-1.5 [&_th]:font-semibold [&_th]:text-left',
  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-top',
  '[&_tbody_tr:nth-child(even)]:bg-white/[0.03]',
  '[&_.footnotes]:mt-6 [&_.footnotes]:border-t [&_.footnotes]:border-border [&_.footnotes]:pt-3 [&_.footnotes]:text-xs [&_.footnotes]:text-fg-muted',
  '[&_hr]:border-border [&_hr]:my-4',
  '[&_img]:max-w-full',
].join(' ')

// Same rendering, scaled down for a small popup instead of a full editor
// tab — the full-size headings above (text-2xl/text-xl) read fine on a
// full page but dwarf a 480px modal's own chrome.
export const COMPACT_PROSE_CLASSES = [
  'px-5 py-4 text-sm text-fg',
  '[&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-2',
  '[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2',
  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
  '[&_p]:mb-2 [&_p]:leading-relaxed',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2',
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2',
  '[&_li]:mb-1',
  '[&_a]:text-accent [&_a]:underline',
  '[&_code]:bg-white/10 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  '[&_hr]:border-border [&_hr]:my-3',
].join(' ')
