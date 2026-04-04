import { NodeViewWrapper } from '@tiptap/react'

export default function RawHtmlBlockView({ node, deleteNode, selected }: any) {
  const html = node.attrs.content || ''

  return (
    <NodeViewWrapper
      className={`raw-html-block ${selected ? 'selected' : ''}`}
      data-type="raw-html-block"
    >
      <div
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ position: 'relative' }}
      />
      {selected && (
        <button
          onClick={deleteNode}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          删除
        </button>
      )}
    </NodeViewWrapper>
  )
}
