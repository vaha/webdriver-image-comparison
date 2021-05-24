/**
 * Scroll to y = variable position in the screen
 */
/* istanbul ignore next */
export default function scrollToPosition(yPosition: number, scrollableElement?: HTMLElement): void {
  // Scroll with the default way of scrolling
  (scrollableElement || document.scrollingElement || document.documentElement).scrollTop  = yPosition;
}
