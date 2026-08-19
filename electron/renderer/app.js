document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  const pageTitle = document.getElementById('page-title');

  function activateNav(label) {
    navItems.forEach((n) => n.classList.remove('active'));
    const target = [...navItems].find((n) => n.dataset.label === label);
    if (target) {
      target.classList.add('active');
      pageTitle.textContent = label;
    }
  }

  navItems.forEach((item) => {
    item.addEventListener('click', () => activateNav(item.dataset.label));
  });

  // ── Drop zone ──────────────────────────────────────────────

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-active');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
  });

  // ── Quick convert pills ────────────────────────────────────

  const pills = document.querySelectorAll('.pill');

  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // ── Explore Tools card clicks ──────────────────────────────

  const toolCards = document.querySelectorAll('.tool-card');

  toolCards.forEach((card) => {
    card.addEventListener('click', () => {
      const label = card.dataset.nav;
      if (label) activateNav(label);
    });
  });
});
