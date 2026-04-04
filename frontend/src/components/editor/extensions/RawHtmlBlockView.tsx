import { NodeViewWrapper } from '@tiptap/react'
import { useState, useRef, useCallback } from 'react'

export default function RawHtmlBlockView({ node, updateAttributes, deleteNode, selected }: any) {
  const html = node.attrs.content || ''
  const [editing, setEditing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditing(true)
  }, [])

  const handleBlur = useCallback(() => {
    if (contentRef.current) {
      const newHtml = contentRef.current.innerHTML
      updateAttributes({ content: newHtml })
    }
    setEditing(false)
  }, [updateAttributes])

  // Prevent TipTap from handling keyboard events when editing inside block
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editing) {
      e.stopPropagation()
      // Allow Ctrl+Z / Ctrl+Y for undo/redo inside the block
      if (e.key === 'Escape') {
        handleBlur()
      }
    }
  }, [editing, handleBlur])

  return (
    <NodeViewWrapper
      className={`raw-html-block ${selected ? 'selected' : ''} ${editing ? 'editing' : ''}`}
      data-type="raw-html-block"
    >
      <div
        ref={contentRef}
        contentEditable={editing}
        suppressContentEditableWarning
        dangerouslySetInnerHTML={editing ? undefined : { __html: html }}
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          cursor: editing ? 'text' : 'pointer',
          outline: editing ? '2px solid #A855F7' : 'none',
          outlineOffset: editing ? '2px' : '0',
          borderRadius: '4px',
          minHeight: '20px',
        }}
      />
      {/* Toolbar: shown when selected but not editing */}
      {selected && !editing && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            display: 'flex',
            gap: '4px',
            zIndex: 10,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
            style={{
              background: '#A855F7',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            编辑
          </button>
          <button
            onClick={deleteNode}
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            删除
          </button>
        </div>
      )}
      {editing && (
        <div
          style={{
            position: 'absolute',
            top: -28,
            right: 0,
            fontSize: '11px',
            color: '#A855F7',
            background: 'rgba(168,85,247,0.1)',
            padding: '2px 8px',
            borderRadius: '4px',
          }}
        >
          编辑中 · Esc 退出
        </div>
      )}
    </NodeViewWrapper>
  )
}
