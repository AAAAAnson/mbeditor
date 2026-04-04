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
 * Wraps known interactive/SVG blocks (sections with <style> tags, checkbox/radio hacks)
 * into raw-html-block divs so TipTap treats them as atomic nodes.
 */
export function prepareHTMLForEditor(html: string): string {
  if (!html.trim()) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Find top-level <section> elements that contain <style> tags (interactive blocks)
  const topSections = doc.body.querySelectorAll(':scope > section')
  topSections.forEach((section) => {
    if (section.querySelector('style') || section.querySelector('input[type="checkbox"]') || section.querySelector('input[type="radio"]')) {
      const wrapper = doc.createElement('div')
      wrapper.setAttribute('data-type', 'raw-html-block')
      wrapper.setAttribute('data-raw-content', section.outerHTML)
      section.replaceWith(wrapper)
    }
  })

  return doc.body.innerHTML
}
