/**
 * navigation.js
 * Handles sidebar nav item activation and page title updates.
 * Exported so other modules can call activateNav() directly.
 */

export function initNavigation() {
  const navItems  = document.querySelectorAll('.nav-item');
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

  // Expose for external callers (e.g. tool-card clicks in dashboard.js)
  return { activateNav };
}
