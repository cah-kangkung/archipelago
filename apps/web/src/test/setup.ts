import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import './viewport'

// jsdom does not implement scrolling; the router calls it on navigation.
window.scrollTo = () => {}

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
