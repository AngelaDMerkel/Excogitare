/* Interactive warning proposal. Only warnings/index.html loads this file. */
(() => {
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.5a2 2 0 0 1 3.4 0l8 13.7a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3Z"/><path d="M12 9v5m0 3h.01"/></svg>';
  const copy = {
    geometry: ['Extreme proportions', 'Narrow maps can limit viable starting areas. Civ V or WorldBuilder may reject these dimensions.', 'Try fewer players, more land or a larger size.'],
    size: ['Experimental size', 'Extreme and Colossal use more memory and may not load reliably in Civ V or WorldBuilder.', 'Try Huge if generation or loading becomes unstable.'],
  };
  const fields = [];
  const popup = document.createElement('aside');
  popup.id = 'dimension-warning-popover';
  popup.className = 'dimension-popover';
  popup.setAttribute('role', 'tooltip');
  popup.hidden = true;
  document.body.append(popup);
  let active = null, pinned = false, timer;
  function close() {
    clearTimeout(timer);
    if (active) { active.button.setAttribute('aria-expanded', 'false'); active.button.removeAttribute('aria-describedby'); }
    popup.hidden = true; active = null; pinned = false;
  }
  function position() {
    if (!active) return;
    const anchor = active.button.getBoundingClientRect();
    if (!anchor.width || document.body.classList.contains('mobile-simple')) { close(); return; }
    const panel = document.querySelector('.panel').getBoundingClientRect();
    const left = Math.max(16, Math.min(panel.right + 12, innerWidth - popup.offsetWidth - 16));
    const top = Math.max(16, Math.min(anchor.top - 9, innerHeight - popup.offsetHeight - 16));
    popup.style.left = `${left}px`; popup.style.top = `${top}px`;
  }
  function show(field) {
    if (field.button.hidden) return;
    clearTimeout(timer);
    if (active !== field) { close(); active = field; }
    const [title, body, hint] = copy[field.kind];
    const heading = document.createElement('strong'); heading.textContent = title;
    const content = document.createElement('p'); content.textContent = body;
    const advice = document.createElement('p'); advice.textContent = hint;
    popup.replaceChildren(heading, content, advice); popup.hidden = false;
    field.button.setAttribute('aria-expanded', 'true'); field.button.setAttribute('aria-describedby', popup.id);
    position();
  }
  function later() { clearTimeout(timer); if (!pinned && document.activeElement !== active?.button) timer = setTimeout(close, 180); }
  for (const editor of ['standard', 'advanced']) for (const kind of ['size', 'geometry']) {
    const input = document.getElementById(`${editor}-${kind}`), original = input.closest('label');
    const row = document.createElement('div'); row.className = 'dimension-field';
    const caption = document.createElement('div'); caption.className = 'dimension-caption';
    const label = document.createElement('label'); label.htmlFor = input.id; label.textContent = original.firstElementChild.textContent;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'dimension-warning'; button.innerHTML = icon;
    button.setAttribute('aria-label', `${kind === 'size' ? 'Size' : 'Geometry'} warning`);
    button.setAttribute('aria-controls', popup.id); button.setAttribute('aria-expanded', 'false');
    caption.append(label, button); original.replaceWith(row); row.append(caption, input);
    const field = { kind, input, button }; fields.push(field);
    const options = kind === 'size' ? window.V3Dimensions.V3_MAP_SIZES : window.V3Dimensions.V3_MAP_GEOMETRIES;
    field.refresh = () => {
      button.hidden = !options.some(option => option.id === input.value && option.experimental);
      if (active === field) close();
    };
    input.addEventListener('change', field.refresh);
    button.addEventListener('pointerenter', () => { if (!pinned) show(field); });
    button.addEventListener('pointerleave', later);
    button.addEventListener('focus', () => show(field));
    button.addEventListener('blur', later);
    button.addEventListener('click', () => { if (active === field && pinned) close(); else { show(field); pinned = true; } });
    field.refresh();
  }
  popup.addEventListener('pointerenter', () => clearTimeout(timer));
  popup.addEventListener('pointerleave', later);
  document.addEventListener('pointerdown', event => { if (active && !active.button.contains(event.target) && !popup.contains(event.target)) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.addEventListener('toggle', position, true);
  document.querySelector('.modes').addEventListener('click', close);
  document.getElementById('reset-advanced').addEventListener('click', () => fields.forEach(field => field.refresh()));
  document.querySelector('.panel-scroll').addEventListener('scroll', close);
  window.addEventListener('resize', position);
  window.addEventListener('v3:sidebar-fit', position);
  new MutationObserver(() => { fields.forEach(field => field.refresh()); }).observe(document.getElementById('standard-generation'), { attributes: true, attributeFilter: ['hidden'] });
  const applyStandard = window.V3GenerationControls.applyStandard;
  window.V3GenerationControls.applyStandard = parameters => { applyStandard(parameters); fields.forEach(field => field.refresh()); };
  document.getElementById('standard-size').value = 'COLOSSAL';
  document.getElementById('standard-geometry').value = 'RIBBON';
  fields.forEach(field => field.refresh());
  requestAnimationFrame(() => { show(fields.find(field => field.input.id === 'standard-geometry')); pinned = true; });
})();
