/**
 * Svelte action: drag-to-scroll
 * Enables mouse and touch drag-to-scroll on any scrollable container.
 * @param {HTMLElement} node
 */
export function dragScroll(node) {
  let isDown = false;
  let startY = 0;
  let scrollTop = 0;

  const onDown = (e) => {
    isDown = true;
    startY = e.touches?.[0]?.clientY ?? e.clientY;
    scrollTop = node.scrollTop;
    node.style.cursor = 'grabbing';
  };

  const onMove = (e) => {
    if (!isDown) return;
    const y = e.touches?.[0]?.clientY ?? e.clientY;
    node.scrollTop = scrollTop - (y - startY);
  };

  const onUp = () => {
    isDown = false;
    node.style.cursor = '';
  };

  node.addEventListener('mousedown', onDown);
  node.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);

  return {
    destroy() {
      node.removeEventListener('mousedown', onDown);
      node.removeEventListener('touchstart', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    }
  };
}
