/**
 * Shared archive-family thumbnail artwork.
 * Every format keeps the same folded-file silhouette but has its own mark.
 */
export function getArchiveFormatLabel(value = 'ZIP') {
  const normalized = String(value).trim().toLowerCase();
  if (normalized.endsWith('.tar.gz') || normalized === 'tar.gz') return 'TAR.GZ';
  if (normalized.endsWith('.tar.bz2') || normalized === 'tar.bz2') return 'TAR.BZ2';
  if (normalized.endsWith('.tar') || normalized === 'tar') return 'TAR';
  if (normalized.endsWith('.7z') || normalized === '7z') return '7Z';
  if (normalized.endsWith('.rar') || normalized === 'rar') return 'RAR';
  if (normalized.endsWith('.zip') || normalized === 'zip') return 'ZIP';
  return normalized.split('.').pop().toUpperCase().slice(0, 5) || 'ZIP';
}

export function getArchiveFileIconSvg(label = 'ZIP', color = '#84CC16') {
  const format = getArchiveFormatLabel(label);
  const safeLabel = format.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));

  const body = `
    <rect x="3" y="3" width="84" height="110" rx="8"
          fill="color-mix(in srgb, ${color} 13%, var(--bg-card, #0d1117))"/>
    <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
    <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>`;

  let mark = '';
  if (format === 'ZIP') {
    mark = `
      <rect x="42" y="14" width="8" height="65" rx="3" fill="${color}" opacity="0.3"/>
      <path d="M30 19h15v9H30zm0 18h15v9H30zm0 18h15v9H30z" fill="${color}"/>
      <path d="M50 28h14v9H50zm0 18h14v9H50zm0 18h14v9H50z" fill="${color}" opacity="0.62"/>
      <rect x="37" y="70" width="18" height="12" rx="4" fill="${color}"/>
      <circle cx="46" cy="76" r="2" fill="#081918"/>`;
  } else if (format === '7Z' || format === '7ZIP') {
    mark = `
      <path d="M27 31h38L37 72h28" fill="none" stroke="${color}" stroke-width="8" stroke-linejoin="bevel"/>
      <path d="M29 88h36" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
      <circle cx="46" cy="89" r="4" fill="${color}"/>`;
  } else if (format === 'TAR') {
    mark = `
      <path d="M26 31h40l-4 43H30z" fill="${color}" opacity="0.9"/>
      <path d="M24 31h44M25 42h42M26 53h40M27 64h38" stroke="#081918" stroke-width="3" opacity="0.5"/>
      <path d="M34 23h24M39 18h14" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
  } else if (format === 'TAR.GZ' || format === 'GZ') {
    mark = `
      <path d="M27 35h38l-4 38H31z" fill="${color}" opacity="0.88"/>
      <path d="M31 46h30M30 57h30M29 68h30" stroke="#081918" stroke-width="3" opacity="0.48"/>
      <circle cx="47" cy="82" r="13" fill="color-mix(in srgb, ${color} 35%, var(--bg-card, #0d1117))" stroke="${color}" stroke-width="4"/>
      <path d="M47 75v14m-7-7h14" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
  } else if (format === 'TAR.BZ2' || format === 'BZ2') {
    mark = `
      <path d="M27 35h38l-4 38H31z" fill="${color}" opacity="0.88"/>
      <path d="M31 46h30M30 57h30M29 68h30" stroke="#081918" stroke-width="3" opacity="0.48"/>
      <circle cx="46" cy="82" r="13" fill="${color}"/>
      <path d="M39 82c0-5 3-8 7-8s7 3 7 8-3 8-7 8-7-3-7-8Z" fill="none" stroke="#081918" stroke-width="3"/>`;
  } else {
    mark = `<rect x="25" y="35" width="42" height="38" rx="6" fill="${color}" opacity="0.85"/>`;
  }

  return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${body}${mark}
    <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
    <text x="45" y="102" font-family="Arial,sans-serif" font-size="${safeLabel.length > 6 ? 8 : 10}" font-weight="700"
          fill="#081918" text-anchor="middle" dominant-baseline="middle">${safeLabel}</text>
  </svg>`;
}
