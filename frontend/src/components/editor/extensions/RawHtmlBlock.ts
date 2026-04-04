import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import RawHtmlBlockView from './RawHtmlBlockView'

export const RawHtmlBlock = Node.create({
  name: 'rawHtmlBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      content: {
        default: '',
        renderHTML: (attributes: { content: string }) => ({
          'data-raw-content': attributes.content,
        }),
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-raw-content') || element.innerHTML,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="raw-html-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-type': 'raw-html-block' }, HTMLAttributes),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawHtmlBlockView)
  },
})
