/**
 * quickconvert.js
 * Manages the Quick Convert pill tab selection state.
 * Emits a custom 'quickconvert:change' event so future panels
 * can react to the selected conversion category.
 */

export function initQuickConvert() {
  const pills = document.querySelectorAll('.pill');

  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      // Notify other modules which category is now active
      document.dispatchEvent(
        new CustomEvent('quickconvert:change', {
          detail: { category: pill.dataset.pill },
        })
      );
    });
  });
}
