import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import UnderlineExt from '@tiptap/extension-underline'
import { RawHtmlBlock } from './extensions/RawHtmlBlock'
import EditorToolbar from './EditorToolbar'
import { getArticleHTML, prepareHTMLForEditor } from '@/utils/tiptap-html'
import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'

export interface WechatTiptapEditorHandle {
  insertRawHtmlBlock: (html: string) => void
  insertImage: (url: string) => void
}

interface WechatTiptapEditorProps {
  html: string
  css: string
  onChange: (html: string) => void
  onImageUpload: () => void
}

const WechatTiptapEditor = forwardRef<WechatTiptapEditorHandle, WechatTiptapEditorProps>(
  function WechatTiptapEditor({ html, css, onChange, onImageUpload }, ref) {
    const isInternalUpdate = useRef(false)
    const lastExternalHtml = useRef(html)

    const editor = useEditor({
      extensions: [
        StarterKit,
        Image.configure({ inline: false }).extend({
          renderHTML({ HTMLAttributes }) {
            return [
              'img',
              {
                ...HTMLAttributes,
                style: `border-radius:8px;max-width:100%;${HTMLAttributes.style || ''}`,
              },
            ]
          },
        }),
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder: '开始编辑文章内容...' }),
        UnderlineExt,
        RawHtmlBlock,
      ],
      content: prepareHTMLForEditor(html),
      onUpdate({ editor }) {
        isInternalUpdate.current = true
        const articleHtml = getArticleHTML(editor)
        lastExternalHtml.current = articleHtml
        onChange(articleHtml)
        // Reset flag after React render cycle
        setTimeout(() => {
          isInternalUpdate.current = false
        }, 100)
      },
    })

    // Sync external HTML changes (from code editor) into TipTap
    useEffect(() => {
      if (!editor || editor.isDestroyed) return
      if (isInternalUpdate.current) return
      if (html === lastExternalHtml.current) return

      lastExternalHtml.current = html
      const prepared = prepareHTMLForEditor(html)
      editor.commands.setContent(prepared)
    }, [html, editor])

    // Expose imperative methods to parent
    useImperativeHandle(
      ref,
      () => ({
        insertRawHtmlBlock(rawHtml: string) {
          if (!editor) return
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'rawHtmlBlock',
              attrs: { content: rawHtml },
            })
            .run()
        },
        insertImage(url: string) {
          if (!editor) return
          editor.chain().focus().setImage({ src: url }).run()
        },
      }),
      [editor],
    )

    const handleImageUpload = useCallback(() => {
      onImageUpload()
    }, [onImageUpload])

    return (
      <div className="tiptap-editor h-full flex flex-col">
        <EditorToolbar editor={editor} onImageUpload={handleImageUpload} />
        <style>{`
          .tiptap-editor .ProseMirror img {
            border-radius: 8px !important;
            max-width: 100% !important;
            box-shadow: none !important;
            cursor: pointer;
          }
          .tiptap-editor .ProseMirror img:hover {
            outline: 2px solid #A855F7;
            outline-offset: 2px;
          }
          .tiptap-editor .ProseMirror *::selection {
            background: rgba(168, 85, 247, 0.3);
          }
          ${css}
        `}</style>
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: '16px',
            fontFamily: '-apple-system, sans-serif',
            fontSize: '16px',
            lineHeight: '1.8',
            color: '#333',
            background: '#fff',
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    )
  },
)

export default WechatTiptapEditor
