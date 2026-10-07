import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import './viewport'

// jsdom does not implement scrolling; the router calls it on navigation.
window.scrollTo = () => {}

// jsdom does not implement scrollIntoView; the task panel scrolls the selected row into view.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

// jsdom lacks HTMLDialogElement.showModal/close; mimic them by toggling `open`.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// jsdom has no canvas contexts. Answer null quietly so the WebGL probe falls back to the card view.
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext
