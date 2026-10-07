/* Keep the chat inside the visible viewport without scrolling/focusing the page. */
(function () {
  if (!['parent-chat', 'teacher-chat', 'sgb-chat'].includes(document.body.dataset.page)) return;
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let frame = 0;
  let fullHeight = window.innerHeight;
  let lastWidth = window.innerWidth;
  function update() {
    frame = 0;
    const height = viewport?.height || window.innerHeight;
    // Ignore pinch zoom: it is user navigation, not a keyboard resize.
    if (viewport && viewport.scale !== 1) return;
    if (window.innerWidth !== lastWidth) {
      fullHeight = window.innerHeight;
      lastWidth = window.innerWidth;
    }
    fullHeight = Math.max(fullHeight, window.innerHeight, height);
    root.style.setProperty('--chat-viewport-height', height + 'px');
    root.style.setProperty('--chat-viewport-top', (viewport?.offsetTop || 0) + 'px');
    document.body.classList.toggle('chat-keyboard-open', height < fullHeight * 0.8);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', () => { fullHeight = 0; schedule(); });
  update();
})();
