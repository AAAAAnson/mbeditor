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
 * Check if an element is "complex" — has inline style + nested block children,
 * or contains interactive elements (SVG templates).
 */
function isComplexBlock(el: Element): boolean {
  const isInteractive =
    el.querySelector('style') ||
    el.querySelector('input[type="checkbox"]') ||
    el.querySelector('input[type="radio"]')
  if (isInteractive) return true

  const hasInlineStyle = el.hasAttribute('style')
  const hasNestedBlocks = el.querySelector(
    'section, div, h1, h2, h3, h4, h5, h6, blockquote, table, pre, ul, ol'
  )
  return !!(hasInlineStyle && hasNestedBlocks)
}

/**
 * Prepare HTML for loading into TipTap editor.
 *
 * Strategy: break the article into the smallest possible independent blocks.
 * - A top-level wrapper section (with many child sections) gets "unwrapped" —
 *   each child section becomes its own RawHtmlBlock.
 * - Simple styled elements (single p, h1, etc. with style) also become RawHtmlBlocks.
 * - Plain text without style stays as TipTap-editable content.
 */
export function prepareHTMLForEditor(html: string): string {
  if (!html.trim()) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const result: string[] = []

  const topElements = Array.from(doc.body.children)

  for (const el of topElements) {
    // Check if this is a large wrapper section containing multiple child sections
    const childSections = el.querySelectorAll(':scope > section')

    if (childSections.length > 1 && el.tagName.toLowerCase() === 'section') {
      // Unwrap: each direct child becomes its own block
      // But first, capture the wrapper's style to apply context (background etc.)
      const wrapperStyle = el.getAttribute('style') || ''

      for (const child of Array.from(el.children)) {
        // Merge parent style context into each child for visual consistency
        if (wrapperStyle && child instanceof HTMLElement) {
          const existingStyle = child.getAttribute('style') || ''
          // Only add wrapper styles that provide context (background, color, font)
          const contextStyles = extractContextStyles(wrapperStyle)
          if (contextStyles && !existingStyle.includes('background')) {
            child.setAttribute('style', `${contextStyles}${existingStyle}`)
          }
        }

        const wrapper = doc.createElement('div')
        wrapper.setAttribute('data-type', 'raw-html-block')
        wrapper.setAttribute('data-raw-content', (child as Element).outerHTML)
        result.push(wrapper.outerHTML)
      }
    } else if (isComplexBlock(el) || el.hasAttribute('style')) {
      // Single complex block — wrap as atom
      const wrapper = doc.createElement('div')
      wrapper.setAttribute('data-type', 'raw-html-block')
      wrapper.setAttribute('data-raw-content', el.outerHTML)
      result.push(wrapper.outerHTML)
    } else {
      // Simple content — let TipTap handle it as editable
      result.push(el.outerHTML)
    }
  }

  return result.join('\n')
}

/**
 * Extract context styles from a wrapper (background, color, font-family)
 * that children might need to inherit.
 */
function extractContextStyles(style: string): string {
  const contextProps = ['background', 'color', 'font-family', 'max-width', 'margin']
  const parts: string[] = []

  for (const prop of contextProps) {
    const regex = new RegExp(`${prop}\\s*:[^;]+;?`, 'gi')
    const match = style.match(regex)
    if (match) {
      parts.push(match[0].endsWith(';') ? match[0] : match[0] + ';')
    }
  }

  return parts.join('')
}
