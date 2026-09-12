/**
 * Shared archive-family thumbnail artwork.
 * ZIP keeps its own realistic folder design (see recent.js → getCustomZipFolderSvg).
 * Every other format gets a unique, high-fidelity SVG icon here.
 */
export function getArchiveFormatLabel(value = 'ZIP') {
  const normalized = String(value).trim().toLowerCase();
  if (normalized.endsWith('.tar.gz') || normalized === 'tar.gz') return 'TAR.GZ';
  if (normalized.endsWith('.tar.bz2') || normalized === 'tar.bz2') return 'TAR.BZ2';
  if (normalized.endsWith('.tar.xz') || normalized === 'tar.xz') return 'TAR.XZ';
  if (normalized.endsWith('.tar') || normalized === 'tar') return 'TAR';
  if (normalized.endsWith('.7z') || normalized === '7z') return '7Z';
  if (normalized.endsWith('.rar') || normalized === 'rar') return 'RAR';
  if (normalized.endsWith('.zip') || normalized === 'zip') return 'ZIP';
  if (normalized.endsWith('.iso') || normalized === 'iso') return 'ISO';
  if (normalized.endsWith('.dmg') || normalized === 'dmg') return 'DMG';
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

let _iconSeq = 0;
export function getArchiveFileIconSvg(label = 'ZIP', color = '#84CC16') {
  const format = getArchiveFormatLabel(label);
  const safeLabel = format.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const uid = ++_iconSeq;

  /* ─────────────────────────────────────────────────────────────────────────
   *  Each format: unique visual metaphor, consistent 90×116 canvas.
   *  Base document shape is shared but mark + badge color are all unique.
   * ───────────────────────────────────────────────────────────────────────── */

  if (format === 'ZIP') {
    /* ZIP — kept as the distinct zipper file body (small version) */
    return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="zipDoc_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
        </linearGradient>
        <linearGradient id="zipDoc_track_${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#27272A"/>
          <stop offset="50%" stop-color="#52525B"/>
          <stop offset="100%" stop-color="#27272A"/>
        </linearGradient>
        <linearGradient id="zipDoc_pull_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="#94A3B8"/>
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#zipDoc_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
      <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
      <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
      <!-- zipper track -->
      <rect x="42" y="10" width="7" height="72" rx="2" fill="url(#zipDoc_track_${uid})"/>
      <!-- teeth left -->
      <rect x="34" y="14" width="8" height="6" rx="1.5" fill="${color}"/>
      <rect x="34" y="26" width="8" height="6" rx="1.5" fill="${color}"/>
      <rect x="34" y="38" width="8" height="6" rx="1.5" fill="${color}"/>
      <rect x="34" y="50" width="8" height="6" rx="1.5" fill="${color}"/>
      <rect x="34" y="62" width="8" height="6" rx="1.5" fill="${color}"/>
      <!-- teeth right -->
      <rect x="49" y="20" width="8" height="6" rx="1.5" fill="${color}" opacity="0.6"/>
      <rect x="49" y="32" width="8" height="6" rx="1.5" fill="${color}" opacity="0.6"/>
      <rect x="49" y="44" width="8" height="6" rx="1.5" fill="${color}" opacity="0.6"/>
      <rect x="49" y="56" width="8" height="6" rx="1.5" fill="${color}" opacity="0.6"/>
      <rect x="49" y="68" width="8" height="6" rx="1.5" fill="${color}" opacity="0.6"/>
      <!-- slider -->
      <rect x="38" y="41" width="15" height="11" rx="2.5" fill="url(#zipDoc_pull_${uid})" stroke="#64748B" stroke-width="0.8"/>
      <rect x="40" y="43" width="7" height="3" rx="1" fill="#475569"/>
      <!-- pull tab -->
      <path d="M41 52 L49 52 L50 63 C50 65 48 66 45.5 66 C43 66 41 65 41 63 Z" fill="url(#zipDoc_pull_${uid})" stroke="#64748B" stroke-width="0.8"/>
      <circle cx="45.5" cy="60" r="1.8" fill="#475569"/>
      <!-- badge -->
      <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
      <text x="45" y="102" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#081918" text-anchor="middle" dominant-baseline="middle">ZIP</text>
    </svg>`;
  }

  if (format === 'RAR') {
    /* RAR — layered archive stacks / pages metaphor with a claw clasp */
    return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="rar_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#rar_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
      <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
      <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
      <!-- stacked sheets -->
      <rect x="20" y="28" width="46" height="8" rx="3" fill="${color}" opacity="0.28"/>
      <rect x="20" y="40" width="46" height="8" rx="3" fill="${color}" opacity="0.45"/>
      <rect x="20" y="52" width="46" height="8" rx="3" fill="${color}" opacity="0.65"/>
      <rect x="20" y="64" width="46" height="8" rx="3" fill="${color}" opacity="0.85"/>
      <!-- vertical separators -->
      <line x1="33" y1="28" x2="33" y2="72" stroke="${color}" stroke-width="1.8" stroke-opacity="0.3"/>
      <line x1="55" y1="28" x2="55" y2="72" stroke="${color}" stroke-width="1.8" stroke-opacity="0.3"/>
      <!-- clasp / lock bracket -->
      <path d="M37 76 L37 83 Q37 88 43 88 L47 88 Q53 88 53 83 L53 76" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="34" y="76" width="22" height="6" rx="2" fill="${color}" opacity="0.9"/>
      <!-- badge -->
      <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
      <text x="45" y="102" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#081918" text-anchor="middle" dominant-baseline="middle">RAR</text>
    </svg>`;
  }

  if (format === '7Z' || format === '7ZIP') {
    /* 7Z — bold angular "7" carved into a dark shield with speed-lines */
    return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="sz_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
        </linearGradient>
        <linearGradient id="sz_shield_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.25"/>
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#sz_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
      <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
      <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
      <!-- shield background -->
      <path d="M45 22 L68 32 L68 60 Q68 78 45 88 Q22 78 22 60 L22 32 Z" fill="url(#sz_shield_${uid})" stroke="${color}" stroke-width="2"/>
      <!-- speed lines -->
      <line x1="22" y1="50" x2="30" y2="50" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4" stroke-linecap="round"/>
      <line x1="22" y1="57" x2="28" y2="57" stroke="${color}" stroke-width="1.5" stroke-opacity="0.3" stroke-linecap="round"/>
      <line x1="60" y1="50" x2="68" y2="50" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4" stroke-linecap="round"/>
      <line x1="62" y1="57" x2="68" y2="57" stroke="${color}" stroke-width="1.5" stroke-opacity="0.3" stroke-linecap="round"/>
      <!-- bold "7" -->
      <path d="M33 35 L57 35 L42 78" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- badge -->
      <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
      <text x="45" y="102" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#081918" text-anchor="middle" dominant-baseline="middle">7Z</text>
    </svg>`;
  }

  if (format === 'TAR') {
    /* TAR — open barrel / reel with horizontal bands — classic Unix tape archive */
    return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="tar_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
        </linearGradient>
        <linearGradient id="tar_barrel_${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.7"/>
          <stop offset="50%" stop-color="${color}" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.7"/>
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#tar_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
      <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
      <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
      <!-- barrel body -->
      <ellipse cx="45" cy="28" rx="22" ry="7" fill="${color}" opacity="0.9"/>
      <rect x="23" y="28" width="44" height="46" fill="url(#tar_barrel_${uid})"/>
      <ellipse cx="45" cy="74" rx="22" ry="7" fill="${color}" opacity="0.75"/>
      <!-- horizontal stave lines -->
      <line x1="23" y1="37" x2="67" y2="37" stroke="#081918" stroke-width="2" stroke-opacity="0.35"/>
      <line x1="23" y1="46" x2="67" y2="46" stroke="#081918" stroke-width="2" stroke-opacity="0.35"/>
      <line x1="23" y1="55" x2="67" y2="55" stroke="#081918" stroke-width="2" stroke-opacity="0.35"/>
      <line x1="23" y1="64" x2="67" y2="64" stroke="#081918" stroke-width="2" stroke-opacity="0.35"/>
      <!-- vertical stave shadow -->
      <line x1="45" y1="21" x2="45" y2="81" stroke="#081918" stroke-width="1.5" stroke-opacity="0.2"/>
      <!-- top label stripe on barrel cap -->
      <ellipse cx="45" cy="28" rx="14" ry="4" fill="#081918" opacity="0.25"/>
      <!-- badge -->
      <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
      <text x="45" y="102" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#081918" text-anchor="middle" dominant-baseline="middle">TAR</text>
    </svg>`;
  }

  if (format === 'TAR.GZ' || format === 'GZ') {
    /* TAR.GZ / GZ — barrel with a "wrapped" compression ribbon + G-node */
    return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="tgz_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
        </linearGradient>
        <linearGradient id="tgz_barrel_${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.65"/>
          <stop offset="50%" stop-color="${color}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.65"/>
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#tgz_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
      <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
      <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
      <!-- barrel body (smaller, leaving room for ribbon) -->
      <ellipse cx="45" cy="26" rx="19" ry="6" fill="${color}" opacity="0.9"/>
      <rect x="26" y="26" width="38" height="38" fill="url(#tgz_barrel_${uid})"/>
      <ellipse cx="45" cy="64" rx="19" ry="6" fill="${color}" opacity="0.75"/>
      <!-- stave lines -->
      <line x1="26" y1="35" x2="64" y2="35" stroke="#081918" stroke-width="1.8" stroke-opacity="0.35"/>
      <line x1="26" y1="44" x2="64" y2="44" stroke="#081918" stroke-width="1.8" stroke-opacity="0.35"/>
      <line x1="26" y1="53" x2="64" y2="53" stroke="#081918" stroke-width="1.8" stroke-opacity="0.35"/>
      <!-- compression spiral ribbon around barrel -->
      <path d="M26 30 Q45 24 64 30" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
      <path d="M26 40 Q45 34 64 40" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
      <path d="M26 50 Q45 44 64 50" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" opacity="0.3"/>
      <!-- G-knot below barrel -->
      <circle cx="45" cy="78" r="9" fill="none" stroke="${color}" stroke-width="3"/>
      <path d="M45 78 L45 71 M45 78 L52 78" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      <!-- badge -->
      <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
      <text x="45" y="102" font-family="Arial,sans-serif" font-size="${safeLabel.length > 5 ? 8 : 10}" font-weight="700" fill="#081918" text-anchor="middle" dominant-baseline="middle">${safeLabel}</text>
    </svg>`;
  }

  if (format === 'TAR.BZ2' || format === 'BZ2' || format === 'TAR.XZ' || format === 'XZ') {
    /* BZ2 / XZ — barrel wrapped tightly with a criss-cross compression band */
    const isBz2 = format === 'TAR.BZ2' || format === 'BZ2';
    return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="bz2_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
        </linearGradient>
        <linearGradient id="bz2_barrel_${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.65"/>
          <stop offset="50%" stop-color="${color}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.65"/>
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#bz2_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
      <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
      <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
      <!-- barrel -->
      <ellipse cx="45" cy="26" rx="19" ry="6" fill="${color}" opacity="0.9"/>
      <rect x="26" y="26" width="38" height="38" fill="url(#bz2_barrel_${uid})"/>
      <ellipse cx="45" cy="64" rx="19" ry="6" fill="${color}" opacity="0.75"/>
      <!-- horizontal staves -->
      <line x1="26" y1="36" x2="64" y2="36" stroke="#081918" stroke-width="1.8" stroke-opacity="0.35"/>
      <line x1="26" y1="46" x2="64" y2="46" stroke="#081918" stroke-width="1.8" stroke-opacity="0.35"/>
      <line x1="26" y1="56" x2="64" y2="56" stroke="#081918" stroke-width="1.8" stroke-opacity="0.35"/>
      <!-- criss-cross binding straps -->
      <path d="M26 26 L64 64" stroke="${color}" stroke-width="2" stroke-opacity="0.5"/>
      <path d="M64 26 L26 64" stroke="${color}" stroke-width="2" stroke-opacity="0.5"/>
      <!-- letter mark beneath barrel -->
      <text x="45" y="82" font-family="Arial,sans-serif" font-size="14" font-weight="900"
            fill="${color}" text-anchor="middle" dominant-baseline="middle" opacity="0.9">${isBz2 ? 'B2' : 'XZ'}</text>
      <!-- badge -->
      <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
      <text x="45" y="102" font-family="Arial,sans-serif" font-size="${safeLabel.length > 5 ? 8 : 10}" font-weight="700" fill="#081918" text-anchor="middle" dominant-baseline="middle">${safeLabel}</text>
    </svg>`;
  }

  if (format === 'ISO') {
    /* ISO — optical disc with concentric rings and a reflective sheen */
    return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="iso_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
        </linearGradient>
        <radialGradient id="iso_disc_${uid}" cx="42%" cy="38%" r="55%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.9"/>
          <stop offset="60%" stop-color="${color}" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.25"/>
        </radialGradient>
      </defs>
      <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#iso_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
      <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
      <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
      <!-- disc body -->
      <circle cx="45" cy="52" r="26" fill="url(#iso_disc_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.6"/>
      <!-- concentric track rings -->
      <circle cx="45" cy="52" r="22" fill="none" stroke="${color}" stroke-width="0.8" stroke-opacity="0.35"/>
      <circle cx="45" cy="52" r="17" fill="none" stroke="${color}" stroke-width="0.8" stroke-opacity="0.35"/>
      <circle cx="45" cy="52" r="12" fill="none" stroke="${color}" stroke-width="0.8" stroke-opacity="0.35"/>
      <!-- specular sheen arc -->
      <path d="M30 38 Q38 28 55 34" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.4"/>
      <!-- centre hub -->
      <circle cx="45" cy="52" r="5.5" fill="#0d1117" stroke="${color}" stroke-width="1.5"/>
      <circle cx="45" cy="52" r="2" fill="${color}" opacity="0.7"/>
      <!-- badge -->
      <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
      <text x="45" y="102" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#081918" text-anchor="middle" dominant-baseline="middle">ISO</text>
    </svg>`;
  }

  if (format === 'DMG') {
    /* DMG — Apple-style HDD platter with a shiny top surface */
    return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="dmg_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
        </linearGradient>
        <linearGradient id="dmg_side_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.4"/>
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#dmg_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
      <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
      <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
      <!-- drive side wall -->
      <rect x="18" y="52" width="54" height="14" rx="3" fill="url(#dmg_side_${uid})"/>
      <!-- drive top platter -->
      <ellipse cx="45" cy="52" rx="27" ry="9" fill="${color}" opacity="0.9"/>
      <!-- platter surface rings -->
      <ellipse cx="45" cy="52" rx="20" ry="6.5" fill="none" stroke="#081918" stroke-width="1.2" stroke-opacity="0.3"/>
      <ellipse cx="45" cy="52" rx="12" ry="4" fill="none" stroke="#081918" stroke-width="1.2" stroke-opacity="0.3"/>
      <!-- specular sheen -->
      <path d="M28 46 Q38 40 58 46" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-opacity="0.4"/>
      <!-- centre spindle -->
      <ellipse cx="45" cy="52" rx="4.5" ry="1.5" fill="#0d1117" opacity="0.6"/>
      <!-- arm / actuator -->
      <line x1="62" y1="52" x2="70" y2="44" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.75"/>
      <circle cx="70" cy="44" r="3" fill="${color}" opacity="0.9"/>
      <!-- read head line -->
      <line x1="70" y1="44" x2="63" y2="50" stroke="#081918" stroke-width="1.5" stroke-opacity="0.5" stroke-linecap="round"/>
      <!-- drive body bottom edge -->
      <ellipse cx="45" cy="66" rx="27" ry="7" fill="${color}" opacity="0.4"/>
      <!-- badge -->
      <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
      <text x="45" y="102" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#081918" text-anchor="middle" dominant-baseline="middle">DMG</text>
    </svg>`;
  }

  if (format === 'CAB') {
    /* CAB — Windows cabinet: toolbox / crate with bolted corners */
    return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="cab_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
        </linearGradient>
        <linearGradient id="cab_box_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#cab_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
      <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
      <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
      <!-- crate / box body -->
      <rect x="18" y="30" width="54" height="48" rx="4" fill="url(#cab_box_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.7"/>
      <!-- horizontal lid line -->
      <line x1="18" y1="44" x2="72" y2="44" stroke="${color}" stroke-width="2" stroke-opacity="0.7"/>
      <!-- vertical slats -->
      <line x1="36" y1="44" x2="36" y2="78" stroke="${color}" stroke-width="1.5" stroke-opacity="0.35"/>
      <line x1="54" y1="44" x2="54" y2="78" stroke="${color}" stroke-width="1.5" stroke-opacity="0.35"/>
      <!-- corner bolts -->
      <circle cx="22" cy="34" r="2.5" fill="${color}" opacity="0.9"/>
      <circle cx="68" cy="34" r="2.5" fill="${color}" opacity="0.9"/>
      <circle cx="22" cy="74" r="2.5" fill="${color}" opacity="0.9"/>
      <circle cx="68" cy="74" r="2.5" fill="${color}" opacity="0.9"/>
      <!-- handle on lid -->
      <path d="M37 44 Q45 36 53 44" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-opacity="0.9"/>
      <circle cx="45" cy="39.5" r="2" fill="${color}" opacity="0.7"/>
      <!-- badge -->
      <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
      <text x="45" y="102" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#081918" text-anchor="middle" dominant-baseline="middle">CAB</text>
    </svg>`;
  }

  /* ── Fallback for any unknown format ─────────────────────────────────── */
  return `<svg class="archive-family-file-svg" viewBox="0 0 90 116" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="afi_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.06"/>
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="84" height="110" rx="8" fill="url(#afi_bg_${uid})" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
    <polygon points="65,3 87,25 65,25" fill="${color}" opacity="0.35"/>
    <polyline points="65,3 65,25 87,25" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
    <rect x="22" y="30" width="46" height="52" rx="5" fill="${color}" opacity="0.75"/>
    <rect x="3" y="91" width="84" height="22" rx="0" fill="${color}"/>
    <text x="45" y="102" font-family="Arial,sans-serif" font-size="${safeLabel.length > 6 ? 8 : 10}" font-weight="700"
          fill="#081918" text-anchor="middle" dominant-baseline="middle">${safeLabel}</text>
  </svg>`;
}
