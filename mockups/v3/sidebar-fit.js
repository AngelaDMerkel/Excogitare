/* Both Generate editors share the measured Standard frame and scale. */
(() => {
  const panel = document.querySelector('.panel');
  const workspace = document.querySelector('.workspace');
  const standard = document.getElementById('standard-generation');
  const generate = document.getElementById('generate-panel');
  const advanced = document.getElementById('advanced-options');
  const actions = document.querySelector('.desktop-map-actions');
  const footer = document.querySelector('.footnote');
  if (!panel || !workspace || !standard || !generate || !advanced || !actions || !footer) return;
  const reference = [panel.querySelector('.brand'), panel.querySelector('.modes'), standard, advanced.querySelector('summary'), panel.querySelector('.panel-actions')];
  const height = element => parseFloat(getComputedStyle(element).height) || element.offsetHeight;
  const borders = element => { const style = getComputedStyle(element); return parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth); };
  let queued = false;
  function fit() {
    queued = false;
    const active = !document.body.classList.contains('mobile-simple') && !generate.hidden;
    document.body.toggleAttribute('data-fit-sidebar', active);
    let scale = 1, frame = '';
    if (active) {
      // Hidden Standard remains a noninteractive layout reference in Advanced.
      // No selected controls are hidden or focused merely to measure the frame.
      const naturalHeight = Math.ceil(reference.reduce((sum, element) => sum + height(element), 0) + borders(panel) + borders(advanced));
      const boundary = Math.min(workspace.getBoundingClientRect().bottom - 16, footer.getBoundingClientRect().top - 12);
      const available = boundary - panel.getBoundingClientRect().top - 12 - actions.getBoundingClientRect().height;
      scale = Math.min(1, Math.max(1, available) / naturalHeight);
      frame = `${naturalHeight}px`;
    }
    const value = String(Math.floor(scale * 10000) / 10000);
    if (document.body.style.getPropertyValue('--sidebar-scale') !== value || document.body.style.getPropertyValue('--sidebar-frame-height') !== frame) {
      document.body.style.setProperty('--sidebar-scale', value);
      if (frame) document.body.style.setProperty('--sidebar-frame-height', frame);
      else document.body.style.removeProperty('--sidebar-frame-height');
      window.dispatchEvent(new Event('v3:sidebar-fit'));
    }
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(fit); } }
  const sizes = new ResizeObserver(schedule);
  for (const element of [workspace, panel, actions, footer, ...reference]) sizes.observe(element);
  const state = new MutationObserver(schedule);
  state.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  for (const element of [standard, generate]) state.observe(element, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', schedule);
  schedule();
})();
