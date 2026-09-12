/**
 * Shared archive-family thumbnail artwork.
 * Every format gets a unique, high-fidelity 90×116 SVG icon.
 */
export function getArchiveFormatLabel(value = 'ZIP') {
  const normalized = String(value).trim().toLowerCase();
  if (normalized.endsWith('.tar.gz') || normalized === 'tar.gz') return 'TAR.GZ';
  if (normalized.endsWith('.tar.bz2') || normalized === 'tar.bz2') return 'TAR.BZ2';
  if (normalized.endsWith('.tar.xz') || normalized === 'tar.xz') return 'TAR.XZ';
  if (normalized.endsWith('.tar') || normalized === 'tar') return 'TAR';
  if (normalized.endsWith('.7z') || normalized === '7z') return '7Z';
  if (normalized.endsWith('.rar') || normalized === 'rar' || normalized === 'rar5' || normalized === 'rar4') return 'RAR';
  if (normalized.endsWith('.zip') || normalized === 'zip') return 'ZIP';
  if (normalized.endsWith('.iso') || normalized === 'iso') return 'ISO';
  if (normalized.endsWith('.dmg') || normalized === 'dmg') return 'DMG';
  if (normalized === 'hfs' || normalized === 'hfs+') return 'DMG';
  if (normalized.endsWith('.cab') || normalized === 'cab') return 'CAB';
  if (normalized.endsWith('.xz') || normalized === 'xz') return 'XZ';
  if (normalized.endsWith('.bz2') || normalized === 'bz2') return 'BZ2';
  if (normalized.endsWith('.gz') || normalized === 'gz') return 'GZ';
  return normalized.split('.').pop().toUpperCase().slice(0, 6) || 'ZIP';
}

let _folderSeq = 0;
export function getArchiveFolderIconSvg(color = '#84CC16') {
  const uid = ++_folderSeq;
  return `<svg class="archive-folder-icon-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="afiFolder_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.08"/>
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#afiFolder_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.35"/>
    <path d="M18 39V30c0-3 2-5 5-5h17l7 8h20c3 0 5 2 5 5v7H18Z" fill="${color}" opacity="0.72"/>
    <path d="M15 40c0-3 2-5 5-5h50c4 0 6 3 5 7l-6 34c-1 5-4 7-9 7H22c-5 0-8-3-7-8l4-29c0-1-2-3-4-3Z" fill="${color}"/>
    <path d="M22 51h46M20 62h46M18 73h45" stroke="#081918" stroke-width="3" stroke-linecap="round" opacity="0.28"/>
    <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
    <text x="45" y="102" font-family="Arial,sans-serif" font-size="10" font-weight="700"
      fill="#081918" text-anchor="middle" dominant-baseline="middle">FOLDER</text>
  </svg>`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Shared doc-card base: subtle tinted background + dog-ear corner
 * ───────────────────────────────────────────────────────────────────────────── */
function _base(uid, color, body, label, smallLabel = false) {
  const fs = smallLabel ? 8 : (label.length > 5 ? 9 : 10);
  return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ab_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="ab_badge_${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <!-- card background -->
  <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#ab_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.38"/>
  <!-- dog-ear corner fold -->
  <polygon points="62,3 87,28 62,28" fill="${color}" opacity="0.32"/>
  <polyline points="62,3 62,28 87,28" fill="none" stroke="${color}" stroke-width="1.4" opacity="0.55"/>
  <!-- content area -->
  ${body}
  <!-- bottom badge bar -->
  <rect x="3" y="91" width="84" height="22" rx="0" fill="url(#ab_badge_${uid})"/>
  <text x="45" y="102" font-family="Arial,sans-serif" font-size="${fs}" font-weight="800"
        fill="#081918" text-anchor="middle" dominant-baseline="middle" letter-spacing="0.5">${label}</text>
</svg>`;
}

let _iconSeq = 0;
export function getArchiveFileIconSvg(label = 'ZIP', color = '#84CC16') {
  const format = getArchiveFormatLabel(label);
  const safeLabel = format.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const uid = ++_iconSeq;
  const c = color;

  /* ───────────────────────────────────────────────────────────────────────────
   * ZIP — Classic metallic zipper running down a document
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'ZIP') {
    const body = `
      <defs>
        <linearGradient id="zip_track_${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="48%" stop-color="#475569"/>
          <stop offset="100%" stop-color="#1e293b"/>
        </linearGradient>
        <linearGradient id="zip_pull_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f1f5f9"/>
          <stop offset="100%" stop-color="#94a3b8"/>
        </linearGradient>
      </defs>
      <!-- zipper track down center -->
      <rect x="42" y="10" width="6" height="75" rx="2" fill="url(#zip_track_${uid})"/>
      <!-- teeth LEFT — solid color -->
      <rect x="33" y="13" width="9" height="5" rx="1.5" fill="${c}"/>
      <rect x="33" y="24" width="9" height="5" rx="1.5" fill="${c}"/>
      <rect x="33" y="35" width="9" height="5" rx="1.5" fill="${c}"/>
      <rect x="33" y="46" width="9" height="5" rx="1.5" fill="${c}"/>
      <rect x="33" y="57" width="9" height="5" rx="1.5" fill="${c}"/>
      <rect x="33" y="68" width="9" height="5" rx="1.5" fill="${c}"/>
      <!-- teeth RIGHT — slightly dimmer -->
      <rect x="48" y="18" width="9" height="5" rx="1.5" fill="${c}" opacity="0.58"/>
      <rect x="48" y="29" width="9" height="5" rx="1.5" fill="${c}" opacity="0.58"/>
      <rect x="48" y="40" width="9" height="5" rx="1.5" fill="${c}" opacity="0.58"/>
      <rect x="48" y="51" width="9" height="5" rx="1.5" fill="${c}" opacity="0.58"/>
      <rect x="48" y="62" width="9" height="5" rx="1.5" fill="${c}" opacity="0.58"/>
      <rect x="48" y="73" width="9" height="5" rx="1.5" fill="${c}" opacity="0.58"/>
      <!-- slider body -->
      <rect x="37" y="38" width="16" height="12" rx="3" fill="url(#zip_pull_${uid})" stroke="#64748b" stroke-width="0.8"/>
      <rect x="39" y="40" width="8" height="3.5" rx="1" fill="#475569"/>
      <!-- pull tab -->
      <path d="M40 50 L50 50 L51 65 C51 67.5 48.5 69 45 69 C41.5 69 39 67.5 39 65 Z" fill="url(#zip_pull_${uid})" stroke="#64748b" stroke-width="0.8"/>
      <circle cx="45" cy="62" r="2.2" fill="#475569"/>
    `;
    return _base(uid, c, body, 'ZIP');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * RAR — Business briefcase with a gold latch and stacked file tabs
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'RAR') {
    const body = `
      <defs>
        <linearGradient id="rar_case_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
        <linearGradient id="rar_latch_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="1"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.65"/>
        </linearGradient>
      </defs>
      <!-- case body -->
      <rect x="14" y="38" width="62" height="44" rx="5" fill="url(#rar_case_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.8"/>
      <!-- handle arch -->
      <path d="M32 38 C32 28 58 28 58 38" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
      <!-- center divider line -->
      <line x1="14" y1="55" x2="76" y2="55" stroke="${c}" stroke-width="1.6" stroke-opacity="0.5"/>
      <!-- stitching dots on edges -->
      <line x1="14" y1="48" x2="76" y2="48" stroke="${c}" stroke-width="1" stroke-opacity="0.28" stroke-dasharray="3 3"/>
      <line x1="14" y1="66" x2="76" y2="66" stroke="${c}" stroke-width="1" stroke-opacity="0.28" stroke-dasharray="3 3"/>
      <!-- gold latch plate -->
      <rect x="38" y="50" width="14" height="10" rx="2.5" fill="url(#rar_latch_${uid})"/>
      <rect x="40" y="52.5" width="10" height="5" rx="1.5" fill="#1a1a1a" opacity="0.35"/>
      <!-- file tabs peeking from top of case -->
      <rect x="18" y="35" width="10" height="5" rx="2" fill="${c}" opacity="0.7"/>
      <rect x="31" y="33" width="10" height="6" rx="2" fill="${c}" opacity="0.5"/>
      <rect x="44" y="34" width="10" height="5" rx="2" fill="${c}" opacity="0.35"/>
    `;
    return _base(uid, c, body, 'RAR');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * 7Z — Bold angular "7" inside a hexagonal power shield
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === '7Z' || format === '7ZIP') {
    const body = `
      <defs>
        <linearGradient id="sz_shield_${uid}" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.22"/>
        </linearGradient>
      </defs>
      <!-- hexagonal shield -->
      <path d="M45 14 L68 26 L68 62 Q68 80 45 88 Q22 80 22 62 L22 26 Z"
            fill="url(#sz_shield_${uid})" stroke="${c}" stroke-width="2.2"/>
      <!-- inner shield ring -->
      <path d="M45 19 L63 29 L63 61 Q63 76 45 83 Q27 76 27 61 L27 29 Z"
            fill="none" stroke="${c}" stroke-width="1" stroke-opacity="0.35"/>
      <!-- speed / slash lines -->
      <line x1="22" y1="44" x2="31" y2="44" stroke="${c}" stroke-width="1.8" stroke-opacity="0.5" stroke-linecap="round"/>
      <line x1="22" y1="52" x2="29" y2="52" stroke="${c}" stroke-width="1.4" stroke-opacity="0.3" stroke-linecap="round"/>
      <line x1="59" y1="44" x2="68" y2="44" stroke="${c}" stroke-width="1.8" stroke-opacity="0.5" stroke-linecap="round"/>
      <line x1="61" y1="52" x2="68" y2="52" stroke="${c}" stroke-width="1.4" stroke-opacity="0.3" stroke-linecap="round"/>
      <!-- bold "7" glyph -->
      <path d="M33 32 L57 32 L41 78" fill="none" stroke="${c}" stroke-width="10"
            stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="33" y1="32" x2="57" y2="32" stroke="${c}" stroke-width="10" stroke-linecap="round"/>
    `;
    return _base(uid, c, body, '7Z');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TAR — Magnetic tape reel: two flanged hubs with tape wound between
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'TAR') {
    const body = `
      <defs>
        <radialGradient id="tar_reel_${uid}" cx="50%" cy="42%" r="50%">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.9"/>
          <stop offset="70%" stop-color="${c}" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.28"/>
        </radialGradient>
      </defs>
      <!-- reel outer ring -->
      <circle cx="45" cy="50" r="28" fill="url(#tar_reel_${uid})" stroke="${c}" stroke-width="2"/>
      <!-- reel hub rings -->
      <circle cx="45" cy="50" r="22" fill="none" stroke="${c}" stroke-width="1.2" stroke-opacity="0.5"/>
      <circle cx="45" cy="50" r="14" fill="none" stroke="${c}" stroke-width="1.2" stroke-opacity="0.4"/>
      <!-- spokes x3 -->
      <line x1="45" y1="50" x2="45" y2="22" stroke="${c}" stroke-width="2.5" stroke-opacity="0.7" stroke-linecap="round"/>
      <line x1="45" y1="50" x2="69" y2="64" stroke="${c}" stroke-width="2.5" stroke-opacity="0.7" stroke-linecap="round"/>
      <line x1="45" y1="50" x2="21" y2="64" stroke="${c}" stroke-width="2.5" stroke-opacity="0.7" stroke-linecap="round"/>
      <!-- centre hub cap -->
      <circle cx="45" cy="50" r="7" fill="#0d1117" stroke="${c}" stroke-width="1.8"/>
      <circle cx="45" cy="50" r="3" fill="${c}" opacity="0.8"/>
      <!-- tape strand exiting reel -->
      <path d="M73 50 C78 50 82 42 75 38" fill="none" stroke="${c}" stroke-width="2.5"
            stroke-linecap="round" stroke-opacity="0.65"/>
    `;
    return _base(uid, c, body, 'TAR');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TAR.GZ — Reel wrapped in compression coil springs (coil overlay on reel)
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'TAR.GZ') {
    const body = `
      <defs>
        <radialGradient id="tgz_reel_${uid}" cx="50%" cy="42%" r="50%">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.25"/>
        </radialGradient>
      </defs>
      <!-- reel -->
      <circle cx="45" cy="50" r="24" fill="url(#tgz_reel_${uid})" stroke="${c}" stroke-width="1.8"/>
      <circle cx="45" cy="50" r="17" fill="none" stroke="${c}" stroke-width="1" stroke-opacity="0.4"/>
      <!-- spokes -->
      <line x1="45" y1="50" x2="45" y2="26" stroke="${c}" stroke-width="2.2" stroke-opacity="0.65" stroke-linecap="round"/>
      <line x1="45" y1="50" x2="66" y2="62" stroke="${c}" stroke-width="2.2" stroke-opacity="0.65" stroke-linecap="round"/>
      <line x1="45" y1="50" x2="24" y2="62" stroke="${c}" stroke-width="2.2" stroke-opacity="0.65" stroke-linecap="round"/>
      <!-- centre hub -->
      <circle cx="45" cy="50" r="6" fill="#0d1117" stroke="${c}" stroke-width="1.5"/>
      <circle cx="45" cy="50" r="2.5" fill="${c}" opacity="0.8"/>
      <!-- compression coil wrapping around reel (wave arcs) -->
      <path d="M21 32 C25 28 29 36 33 32 C37 28 41 36 45 32 C49 28 53 36 57 32 C61 28 65 36 69 32"
            fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.7"/>
      <path d="M21 70 C25 66 29 74 33 70 C37 66 41 74 45 70 C49 66 53 74 57 70 C61 66 65 74 69 70"
            fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.55"/>
    `;
    return _base(uid, c, body, 'TAR.GZ', true);
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * GZ — Single wave bubble / pressure seal (standalone gzip)
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'GZ') {
    const body = `
      <defs>
        <radialGradient id="gz_bubble_${uid}" cx="42%" cy="38%" r="55%">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.9"/>
          <stop offset="60%" stop-color="${c}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.15"/>
        </radialGradient>
      </defs>
      <!-- main pressure bubble -->
      <circle cx="45" cy="50" r="27" fill="url(#gz_bubble_${uid})" stroke="${c}" stroke-width="1.8"/>
      <!-- concentric pressure rings -->
      <circle cx="45" cy="50" r="20" fill="none" stroke="${c}" stroke-width="1.2" stroke-opacity="0.4" stroke-dasharray="4 3"/>
      <circle cx="45" cy="50" r="13" fill="none" stroke="${c}" stroke-width="1" stroke-opacity="0.35" stroke-dasharray="3 3"/>
      <!-- compression waves on surface -->
      <path d="M27 36 C31 30 39 30 43 36 C47 42 55 42 59 36"
            fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-opacity="0.38"/>
      <!-- G initial -->
      <text x="45" y="54" font-family="Arial,sans-serif" font-size="22" font-weight="900"
            fill="${c}" text-anchor="middle" dominant-baseline="middle" stroke="#081918" stroke-width="3"
            paint-order="stroke">G</text>
    `;
    return _base(uid, c, body, 'GZ');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TAR.BZ2 — Heavy brick / masonry block with cross-compression straps
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'TAR.BZ2' || format === 'BZ2') {
    const isTarBz2 = format === 'TAR.BZ2';
    const body = `
      <defs>
        <linearGradient id="bz2_block_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.82"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.5"/>
        </linearGradient>
      </defs>
      <!-- main compressed block -->
      <rect x="14" y="22" width="62" height="60" rx="4" fill="url(#bz2_block_${uid})" stroke="${c}" stroke-width="2"/>
      <!-- brick mortar lines (horizontal) -->
      <line x1="14" y1="36" x2="76" y2="36" stroke="#081918" stroke-width="2" stroke-opacity="0.35"/>
      <line x1="14" y1="50" x2="76" y2="50" stroke="#081918" stroke-width="2" stroke-opacity="0.35"/>
      <line x1="14" y1="64" x2="76" y2="64" stroke="#081918" stroke-width="2" stroke-opacity="0.35"/>
      <!-- brick mortar lines (vertical — offset per row) -->
      <line x1="45" y1="22" x2="45" y2="36" stroke="#081918" stroke-width="1.5" stroke-opacity="0.3"/>
      <line x1="30" y1="36" x2="30" y2="50" stroke="#081918" stroke-width="1.5" stroke-opacity="0.3"/>
      <line x1="60" y1="36" x2="60" y2="50" stroke="#081918" stroke-width="1.5" stroke-opacity="0.3"/>
      <line x1="45" y1="50" x2="45" y2="64" stroke="#081918" stroke-width="1.5" stroke-opacity="0.3"/>
      <line x1="30" y1="64" x2="30" y2="82" stroke="#081918" stroke-width="1.5" stroke-opacity="0.3"/>
      <line x1="60" y1="64" x2="60" y2="82" stroke="#081918" stroke-width="1.5" stroke-opacity="0.3"/>
      <!-- compression strap diagonal -->
      <path d="M14 22 L76 82" stroke="${c}" stroke-width="2.5" stroke-opacity="0.45"/>
      <path d="M76 22 L14 82" stroke="${c}" stroke-width="2.5" stroke-opacity="0.45"/>
      <!-- center buckle -->
      <rect x="40" y="46" width="10" height="8" rx="2" fill="#0d1117" stroke="${c}" stroke-width="1.5"/>
    `;
    return _base(uid, c, body, isTarBz2 ? 'TAR.BZ2' : 'BZ2', isTarBz2);
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TAR.XZ — Diamond crystal lattice (extreme compression)
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'TAR.XZ' || format === 'XZ') {
    const isTarXz = format === 'TAR.XZ';
    const body = `
      <defs>
        <linearGradient id="xz_crystal_${uid}" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.9"/>
          <stop offset="50%" stop-color="${c}" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.22"/>
        </linearGradient>
      </defs>
      <!-- outer diamond -->
      <polygon points="45,14 74,50 45,86 16,50"
               fill="url(#xz_crystal_${uid})" stroke="${c}" stroke-width="2.2"/>
      <!-- inner diamond ring -->
      <polygon points="45,22 66,50 45,78 24,50"
               fill="none" stroke="${c}" stroke-width="1.2" stroke-opacity="0.4"/>
      <!-- crystal facet lines -->
      <line x1="45" y1="14" x2="45" y2="86" stroke="${c}" stroke-width="1.2" stroke-opacity="0.3"/>
      <line x1="16" y1="50" x2="74" y2="50" stroke="${c}" stroke-width="1.2" stroke-opacity="0.3"/>
      <!-- cross diagonals inside -->
      <line x1="45" y1="14" x2="16" y2="50" stroke="${c}" stroke-width="0.8" stroke-opacity="0.25"/>
      <line x1="45" y1="14" x2="74" y2="50" stroke="${c}" stroke-width="0.8" stroke-opacity="0.25"/>
      <!-- specular highlight -->
      <path d="M34 28 Q38 22 52 30" fill="none" stroke="white" stroke-width="2"
            stroke-linecap="round" stroke-opacity="0.4"/>
      <!-- centre gem -->
      <circle cx="45" cy="50" r="5" fill="#0d1117" stroke="${c}" stroke-width="1.5"/>
      <circle cx="45" cy="50" r="2.5" fill="${c}" opacity="0.9"/>
    `;
    return _base(uid, c, body, isTarXz ? 'TAR.XZ' : 'XZ', isTarXz);
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * ISO — Optical disc with rainbow spectrum band and hub
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'ISO') {
    const body = `
      <defs>
        <radialGradient id="iso_disc_${uid}" cx="44%" cy="40%" r="54%">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.9"/>
          <stop offset="55%" stop-color="${c}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.18"/>
        </radialGradient>
      </defs>
      <!-- disc body -->
      <circle cx="45" cy="50" r="28" fill="url(#iso_disc_${uid})" stroke="${c}" stroke-width="1.8"/>
      <!-- track ring 1 -->
      <circle cx="45" cy="50" r="23" fill="none" stroke="${c}" stroke-width="0.9" stroke-opacity="0.38"/>
      <!-- track ring 2 -->
      <circle cx="45" cy="50" r="17" fill="none" stroke="${c}" stroke-width="0.9" stroke-opacity="0.32"/>
      <!-- track ring 3 -->
      <circle cx="45" cy="50" r="11" fill="none" stroke="${c}" stroke-width="0.9" stroke-opacity="0.28"/>
      <!-- rainbow spectrum arc (iridescent sheen) -->
      <path d="M22 38 Q28 26 52 30" fill="none" stroke="#ffffff" stroke-width="3"
            stroke-linecap="round" stroke-opacity="0.32"/>
      <path d="M25 43 Q30 33 55 36" fill="none" stroke="${c}" stroke-width="2"
            stroke-linecap="round" stroke-opacity="0.22"/>
      <!-- centre hub void -->
      <circle cx="45" cy="50" r="6.5" fill="#0d1117" stroke="${c}" stroke-width="1.8"/>
      <circle cx="45" cy="50" r="2.5" fill="${c}" opacity="0.7"/>
    `;
    return _base(uid, c, body, 'ISO');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * DMG — Apple-style disk: stacked platters with actuator arm
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'DMG') {
    const body = `
      <defs>
        <linearGradient id="dmg_side_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
        <radialGradient id="dmg_top_${uid}" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stop-color="${c}" stop-opacity="1"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.65"/>
        </radialGradient>
      </defs>
      <!-- lower platter side wall -->
      <rect x="17" y="56" width="52" height="12" rx="4" fill="url(#dmg_side_${uid})"/>
      <!-- lower platter top -->
      <ellipse cx="43" cy="56" rx="26" ry="7.5" fill="${c}" opacity="0.6"/>
      <!-- upper platter side wall -->
      <rect x="17" y="42" width="52" height="12" rx="4" fill="url(#dmg_side_${uid})"/>
      <!-- upper platter top surface (shiny) -->
      <ellipse cx="43" cy="42" rx="26" ry="8" fill="url(#dmg_top_${uid})" stroke="${c}" stroke-width="1"/>
      <!-- track rings on top platter -->
      <ellipse cx="43" cy="42" rx="19" ry="5.5" fill="none" stroke="#081918" stroke-width="1.2" stroke-opacity="0.3"/>
      <ellipse cx="43" cy="42" rx="11" ry="3" fill="none" stroke="#081918" stroke-width="1.2" stroke-opacity="0.3"/>
      <!-- specular sheen -->
      <path d="M27 36 Q36 28 56 36" fill="none" stroke="white" stroke-width="2.5"
            stroke-linecap="round" stroke-opacity="0.4"/>
      <!-- spindle -->
      <ellipse cx="43" cy="42" rx="4" ry="1.2" fill="#0d1117" opacity="0.65"/>
      <!-- actuator arm -->
      <line x1="62" y1="38" x2="73" y2="28" stroke="${c}" stroke-width="3.5" stroke-linecap="round" opacity="0.8"/>
      <circle cx="73" cy="28" r="4" fill="${c}" opacity="0.9"/>
      <line x1="73" y1="28" x2="63" y2="38" stroke="#081918" stroke-width="2" stroke-opacity="0.5" stroke-linecap="round"/>
    `;
    return _base(uid, c, body, 'DMG');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * CAB — Filing cabinet with two drawers, handle and label slots
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'CAB') {
    const body = `
      <defs>
        <linearGradient id="cab_body_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.78"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.48"/>
        </linearGradient>
        <linearGradient id="cab_handle_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fde68a"/>
          <stop offset="100%" stop-color="#b45309"/>
        </linearGradient>
      </defs>
      <!-- cabinet outer body -->
      <rect x="16" y="18" width="58" height="66" rx="4" fill="url(#cab_body_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.8"/>
      <!-- drawer divider -->
      <line x1="16" y1="51" x2="74" y2="51" stroke="${c}" stroke-width="2" stroke-opacity="0.65"/>
      <!-- top drawer face recess -->
      <rect x="20" y="22" width="50" height="25" rx="3" fill="#0d1117" opacity="0.22"/>
      <!-- bottom drawer face recess -->
      <rect x="20" y="55" width="50" height="25" rx="3" fill="#0d1117" opacity="0.22"/>
      <!-- top drawer handle -->
      <rect x="37" y="32" width="16" height="5" rx="2.5" fill="url(#cab_handle_${uid})"/>
      <!-- bottom drawer handle -->
      <rect x="37" y="65" width="16" height="5" rx="2.5" fill="url(#cab_handle_${uid})"/>
      <!-- top label slot -->
      <rect x="22" y="24" width="18" height="6" rx="1.5" fill="${c}" opacity="0.5"/>
      <!-- bottom label slot -->
      <rect x="22" y="57" width="18" height="6" rx="1.5" fill="${c}" opacity="0.5"/>
      <!-- corner bolts -->
      <circle cx="21" cy="22" r="2.2" fill="${c}" opacity="0.85"/>
      <circle cx="69" cy="22" r="2.2" fill="${c}" opacity="0.85"/>
      <circle cx="21" cy="80" r="2.2" fill="${c}" opacity="0.85"/>
      <circle cx="69" cy="80" r="2.2" fill="${c}" opacity="0.85"/>
    `;
    return _base(uid, c, body, 'CAB');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * Fallback — Generic archive box with format label
   * ─────────────────────────────────────────────────────────────────────────── */
  const body = `
    <defs>
      <linearGradient id="fb_box_${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c}" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
      </linearGradient>
    </defs>
    <!-- box body -->
    <rect x="14" y="28" width="62" height="54" rx="5" fill="url(#fb_box_${uid})" stroke="${c}" stroke-width="1.8"/>
    <!-- lid top -->
    <path d="M14 38 L14 28 Q14 24 18 24 L72 24 Q76 24 76 28 L76 38 Z" fill="${c}" opacity="0.9"/>
    <!-- lid lines -->
    <line x1="14" y1="38" x2="76" y2="38" stroke="${c}" stroke-width="1.5" stroke-opacity="0.7"/>
    <!-- content lines -->
    <line x1="22" y1="50" x2="68" y2="50" stroke="${c}" stroke-width="1.8" stroke-opacity="0.5" stroke-linecap="round"/>
    <line x1="22" y1="60" x2="68" y2="60" stroke="${c}" stroke-width="1.8" stroke-opacity="0.5" stroke-linecap="round"/>
    <line x1="22" y1="70" x2="52" y2="70" stroke="${c}" stroke-width="1.8" stroke-opacity="0.5" stroke-linecap="round"/>
  `;
  return _base(uid, c, body, safeLabel, safeLabel.length > 5);
}
