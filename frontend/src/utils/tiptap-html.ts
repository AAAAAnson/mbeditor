import type { Editor } from '@tiptap/react'

/**
 * Get clean article HTML from the TipTap editor.
 * Replaces <div data-type="raw-html-block" data-raw-content="..."> wrappers
 * with their actual HTML content so the output is ready for WeChat publishing.
 */
export function getArticleHTML(editor: Editor): string {
  const html = editor.getHTML()
  const doc = new DOMParser().parseFromString(html, 'text/html')

  doc.querySelectorAll('[data-type="raw-html-block"]').forEach((el) => {
    const rawContent = el.getAttribute('data-raw-content')
    if (rawContent) {
      const wrapper = document.createElement('div')
      wrapper.innerHTML = rawContent
      el.replaceWith(...Array.from(wrapper.childNodes))
    }
  })

  return doc.body.innerHTML
}

/**
 * Prepare HTML for loading into TipTap editor.
 * Wraps complex styled blocks into raw-html-block divs so TipTap treats them as
 * atomic nodes and preserves their inline styles.
 *
 * A top-level element is treated as a raw block if it:
 * - Contains <style> tags or checkbox/radio inputs (SVG interactive blocks)
 * - Has a style attribute AND contains nested block elements (complex styled layout)
 */
export function prepareHTMLForEditor(html: string): string {
  if (!html.trim()) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')

  const topElements = doc.body.querySelectorAll(':scope > *')
  topElements.forEach((el) => {
    const isInteractive = el.querySelector('style') ||
      el.querySelector('input[type="checkbox"]') ||
      el.querySelector('input[type="radio"]')
    const hasInlineStyle = el.hasAttribute('style')
    const hasNestedBlocks = el.querySelector('section, div, h1, h2, h3, h4, h5, h6, blockquote, table, pre, ul, ol')
    const isComplexStyled = hasInlineStyle && hasNestedBlocks

    if (isInteractive || isComplexStyled) {
      const wrapper = doc.createElement('div')
      wrapper.setAttribute('data-type', 'raw-html-block')
      wrapper.setAttribute('data-raw-content', el.outerHTML)
      el.replaceWith(wrapper)
    }
  })

  return doc.body.innerHTML
}
