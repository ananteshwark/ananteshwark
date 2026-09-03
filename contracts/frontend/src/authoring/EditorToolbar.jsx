import { useCallback } from 'react'
import { promptDialog } from '../confirm'

// The full formatting bar for the contract editor.
//
// It lived inline in the workspace as five buttons — bold, italic, one heading
// level and two list types — which is not enough to write contract paper:
// schedules need centred headings, rate tables need sized text, defined terms
// need emphasis, and an author who cannot do those in the editor does them in
// Word instead and pastes the result back.
//
// Every command here comes from an extension registered on the editor, so a
// button is never shown for something the document cannot represent. Buttons use
// onMouseDown + preventDefault rather than onClick: clicking would move focus
// out of the editor first and collapse the selection being formatted.

const FONTS = [
  ['Default', ''],
  ['Serif (Times)', '"Times New Roman", Times, serif'],
  ['Sans (Arial)', 'Arial, Helvetica, sans-serif'],
  ['Garamond', 'Garamond, Georgia, serif'],
  ['Calibri', 'Calibri, Candara, sans-serif'],
  ['Monospace', '"Courier New", monospace'],
]

const SIZES = ['', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '24pt']

const LINE_HEIGHTS = [['Single', ''], ['1.15', '1.15'], ['1.5', '1.5'], ['Double', '2']]

// Enough colours to mark up a draft without turning it into a palette. The
// first is "no colour", which removes the mark rather than painting black over
// it — those are different in the exported .docx.
const COLORS = [
  ['Default', ''],
  ['Red', '#b3261e'],
  ['Amber', '#8a6100'],
  ['Green', '#1b6b3a'],
  ['Blue', '#12539d'],
  ['Grey', '#5a6472'],
]

const HIGHLIGHTS = [
  ['Yellow', '#fff2a8'],
  ['Green', '#c8f0d2'],
  ['Blue', '#cfe4ff'],
  ['Pink', '#ffd4e5'],
]

function Btn({ active, title, onRun, children, className = 'secondary', disabled }) {
  return (
    <button type="button" className={`${className}${active ? ' active' : ''}`} title={title}
      disabled={disabled}
      onMouseDown={(e) => { e.preventDefault(); onRun() }}>
      {children}
    </button>
  )
}

export default function EditorToolbar({ editor, showTables = true }) {
  const setLink = useCallback(async () => {
    const previous = editor.getAttributes('link')?.href || ''
    const href = await promptDialog('Link address', { default: previous })
    if (href === null) return
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!href.trim()) chain.unsetLink().run()
    else chain.setLink({ href: href.trim() }).run()
  }, [editor])

  if (!editor) return null
  const run = (fn) => () => fn(editor.chain().focus()).run()
  const heading = [1, 2, 3, 4, 5, 6].find((l) => editor.isActive('heading', { level: l })) || ''
  const currentFont = editor.getAttributes('textStyle')?.fontFamily || ''
  const currentSize = editor.getAttributes('textStyle')?.fontSize || ''
  const currentColor = editor.getAttributes('textStyle')?.color || ''
  const currentLineHeight = editor.getAttributes('textStyle')?.lineHeight || ''

  return (
    <span className="fmt-bar">
      <select value={heading} title="Paragraph style" style={{ width: 92 }}
        onChange={(e) => {
          const v = e.target.value
          if (!v) editor.chain().focus().setParagraph().run()
          else editor.chain().focus().toggleHeading({ level: Number(v) }).run()
        }}>
        <option value="">Body</option>
        {[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>Heading {l}</option>)}
      </select>

      <select value={currentFont} title="Font" style={{ width: 110 }}
        onChange={(e) => {
          const v = e.target.value
          if (!v) editor.chain().focus().unsetFontFamily().run()
          else editor.chain().focus().setFontFamily(v).run()
        }}>
        {FONTS.map(([label, value]) => <option key={label} value={value}>{label}</option>)}
      </select>

      <select value={currentSize} title="Font size" style={{ width: 72 }}
        onChange={(e) => {
          const v = e.target.value
          if (!v) editor.chain().focus().unsetFontSize().run()
          else editor.chain().focus().setFontSize(v).run()
        }}>
        <option value="">Size</option>
        {SIZES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <span className="fmt-sep" />

      <Btn active={editor.isActive('bold')} title="Bold (Ctrl/Cmd+B)"
        onRun={run((c) => c.toggleBold())}><b>B</b></Btn>
      <Btn active={editor.isActive('italic')} title="Italic (Ctrl/Cmd+I)"
        onRun={run((c) => c.toggleItalic())}><i>I</i></Btn>
      <Btn active={editor.isActive('underline')} title="Underline (Ctrl/Cmd+U)"
        onRun={run((c) => c.toggleUnderline())}><u>U</u></Btn>
      <Btn active={editor.isActive('strike')} title="Strikethrough"
        onRun={run((c) => c.toggleStrike())}><s>S</s></Btn>
      <Btn active={editor.isActive('superscript')} title="Superscript"
        onRun={run((c) => c.toggleSuperscript())}>x²</Btn>
      <Btn active={editor.isActive('subscript')} title="Subscript"
        onRun={run((c) => c.toggleSubscript())}>x₂</Btn>
      <Btn active={editor.isActive('code')} title="Inline code"
        onRun={run((c) => c.toggleCode())}>{'</>'}</Btn>

      <select value={currentColor} title="Text colour" style={{ width: 92 }}
        onChange={(e) => {
          const v = e.target.value
          if (!v) editor.chain().focus().unsetColor().run()
          else editor.chain().focus().setColor(v).run()
        }}>
        {COLORS.map(([label, value]) => <option key={label} value={value}>{label}</option>)}
      </select>
      <span className="fmt-swatches" title="Highlight">
        {HIGHLIGHTS.map(([label, color]) => (
          <button key={color} type="button" className="fmt-swatch" title={`Highlight ${label.toLowerCase()}`}
            style={{ background: color }}
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHighlight({ color }).run() }} />
        ))}
        <Btn title="Remove highlight" onRun={run((c) => c.unsetHighlight())}>⌫</Btn>
      </span>

      <span className="fmt-sep" />

      <Btn active={editor.isActive({ textAlign: 'left' })} title="Align left"
        onRun={run((c) => c.setTextAlign('left'))}>⯇</Btn>
      <Btn active={editor.isActive({ textAlign: 'center' })} title="Centre"
        onRun={run((c) => c.setTextAlign('center'))}>≡</Btn>
      <Btn active={editor.isActive({ textAlign: 'right' })} title="Align right"
        onRun={run((c) => c.setTextAlign('right'))}>⯈</Btn>
      <Btn active={editor.isActive({ textAlign: 'justify' })} title="Justify"
        onRun={run((c) => c.setTextAlign('justify'))}>▤</Btn>
      <select value={currentLineHeight} title="Line spacing" style={{ width: 86 }}
        onChange={(e) => {
          const v = e.target.value
          if (!v) editor.chain().focus().unsetLineHeight().run()
          else editor.chain().focus().setLineHeight(v).run()
        }}>
        {LINE_HEIGHTS.map(([label, value]) => <option key={label} value={value}>{label}</option>)}
      </select>

      <span className="fmt-sep" />

      <Btn active={editor.isActive('bulletList')} title="Bulleted list"
        onRun={run((c) => c.toggleBulletList())}>• List</Btn>
      <Btn active={editor.isActive('orderedList')} title="Numbered list"
        onRun={run((c) => c.toggleOrderedList())}>1. List</Btn>
      {/* Indent/outdent on a list item is a lift/sink in ProseMirror terms; the
          buttons are disabled outside a list so they cannot silently do nothing. */}
      <Btn title="Increase indent" disabled={!editor.can().sinkListItem('listItem')}
        onRun={run((c) => c.sinkListItem('listItem'))}>⇥</Btn>
      <Btn title="Decrease indent" disabled={!editor.can().liftListItem('listItem')}
        onRun={run((c) => c.liftListItem('listItem'))}>⇤</Btn>
      <Btn active={editor.isActive('blockquote')} title="Block quote"
        onRun={run((c) => c.toggleBlockquote())}>❝</Btn>
      <Btn active={editor.isActive('codeBlock')} title="Code block"
        onRun={run((c) => c.toggleCodeBlock())}>{'{ }'}</Btn>
      <Btn title="Horizontal rule" onRun={run((c) => c.setHorizontalRule())}>―</Btn>
      <Btn active={editor.isActive('link')} title="Link" onRun={setLink}>🔗</Btn>

      {showTables && (
        <>
          <span className="fmt-sep" />
          <Btn title="Insert table (3×3)"
            onRun={run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))}>▦ Table</Btn>
          {editor.isActive('table') && (
            <>
              <Btn title="Add column" onRun={run((c) => c.addColumnAfter())}>+Col</Btn>
              <Btn title="Add row" onRun={run((c) => c.addRowAfter())}>+Row</Btn>
              <Btn title="Delete column" onRun={run((c) => c.deleteColumn())}>−Col</Btn>
              <Btn title="Delete row" onRun={run((c) => c.deleteRow())}>−Row</Btn>
              <Btn title="Merge selected cells" onRun={run((c) => c.mergeCells())}>Merge</Btn>
              <Btn title="Split cell" onRun={run((c) => c.splitCell())}>Split</Btn>
              <Btn title="Toggle header row" onRun={run((c) => c.toggleHeaderRow())}>Header</Btn>
              <Btn className="danger" title="Delete table" onRun={run((c) => c.deleteTable())}>Delete table</Btn>
            </>
          )}
        </>
      )}

      <span className="fmt-sep" />

      {/* Undo/redo live in the page toolbar above, labelled — not repeated here. */}
      <Btn title="Clear formatting" onRun={run((c) => c.unsetAllMarks().clearNodes())}>✕ Format</Btn>
    </span>
  )
}
