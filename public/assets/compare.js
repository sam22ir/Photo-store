// Lamsa Studio before/after slider. Usage: createCompare(beforeSrc, afterSrc, { beforeLabel, afterLabel })
(function () {
  const ARROWS =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
    '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const tr = (key, fallback) => (window.i18n ? window.i18n.t(key) : fallback);
  const clamp = (v) => Math.min(100, Math.max(0, v));

  function createImg(src, cls) {
    const img = document.createElement('img');
    img.className = cls;
    img.src = src;
    img.alt = '';
    img.draggable = false;
    return img;
  }

  function createCompare(beforeSrc, afterSrc, opts = {}) {
    const beforeLabel = opts.beforeLabel || tr('cmp_before', 'Before');
    const afterLabel = opts.afterLabel || tr('cmp_after', 'After');
    let pos = 50;
    let dragging = false;

    const root = document.createElement('div');
    root.className = 'compare';
    root.dir = 'ltr';

    const after = createImg(afterSrc, 'compare-img compare-after');
    const before = createImg(beforeSrc, 'compare-img compare-before');

    const labelBefore = document.createElement('span');
    labelBefore.className = 'compare-label compare-label-before';
    labelBefore.textContent = beforeLabel;

    const labelAfter = document.createElement('span');
    labelAfter.className = 'compare-label compare-label-after';
    labelAfter.textContent = afterLabel;

    const line = document.createElement('div');
    line.className = 'compare-line';

    const handle = document.createElement('div');
    handle.className = 'compare-handle';
    handle.setAttribute('role', 'slider');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', '100');
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.setAttribute('aria-label', tr('cmp_aria', 'Drag to compare before and after'));
    handle.innerHTML = ARROWS;

    root.append(after, before, labelBefore, labelAfter, line, handle);

    // The before image is visible from the left edge up to the divider.
    function render() {
      before.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
      line.style.left = pos + '%';
      handle.style.left = pos + '%';
      handle.setAttribute('aria-valuenow', String(Math.round(pos)));
    }

    function setPos(value) {
      pos = clamp(value);
      render();
    }

    function fromClientX(x) {
      const rect = root.getBoundingClientRect();
      return rect.width ? ((x - rect.left) / rect.width) * 100 : pos;
    }

    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      root.setPointerCapture(e.pointerId);
      setPos(fromClientX(e.clientX));
    });

    root.addEventListener('pointermove', (e) => {
      if (dragging) setPos(fromClientX(e.clientX));
    });

    const stop = (e) => {
      dragging = false;
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    };
    root.addEventListener('pointerup', stop);
    root.addEventListener('pointercancel', stop);

    handle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPos(pos - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPos(pos + 5);
      }
    });

    render();
    return root;
  }

  window.createCompare = createCompare;
})();
