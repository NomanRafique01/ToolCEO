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
   * ZIP — Precision zipped sleeve with interlocking teeth and metallic pull
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'ZIP') {
    const body = `
      <defs>
        <linearGradient id="zip_body_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
        <linearGradient id="zip_slider_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#94a3b8"/>
        </linearGradient>
      </defs>
      <!-- main folder / binder sleeve body -->
      <rect x="15" y="32" width="60" height="50" rx="5" fill="url(#zip_body_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.8"/>
      <!-- top folder tab peeking behind -->
      <path d="M19 32 V27 c0-2 1.5-3.5 3.5-3.5 h14 c2 0 3.5 1.5 4.5 3.5 L43 32 Z" fill="${c}" opacity="0.6"/>
      <!-- horizontal compression seam lines across sleeve -->
      <line x1="15" y1="44" x2="75" y2="44" stroke="${c}" stroke-width="1" stroke-opacity="0.25" stroke-dasharray="3 2"/>
      <line x1="15" y1="68" x2="75" y2="68" stroke="${c}" stroke-width="1" stroke-opacity="0.25" stroke-dasharray="3 2"/>
      <!-- vertical central zipper channel -->
      <rect x="42" y="32" width="6" height="50" fill="#0d1117" opacity="0.4"/>
      <!-- precision interlocking zipper teeth -->
      <rect x="37" y="36" width="6" height="3" rx="1" fill="${c}" opacity="0.9"/>
      <rect x="47" y="38" width="6" height="3" rx="1" fill="${c}" opacity="0.7"/>
      <rect x="37" y="42" width="6" height="3" rx="1" fill="${c}" opacity="0.9"/>
      <rect x="47" y="44" width="6" height="3" rx="1" fill="${c}" opacity="0.7"/>
      <rect x="37" y="48" width="6" height="3" rx="1" fill="${c}" opacity="0.9"/>
      <rect x="47" y="50" width="6" height="3" rx="1" fill="${c}" opacity="0.7"/>
      <rect x="37" y="66" width="6" height="3" rx="1" fill="${c}" opacity="0.9"/>
      <rect x="47" y="68" width="6" height="3" rx="1" fill="${c}" opacity="0.7"/>
      <rect x="37" y="72" width="6" height="3" rx="1" fill="${c}" opacity="0.9"/>
      <rect x="47" y="74" width="6" height="3" rx="1" fill="${c}" opacity="0.7"/>
      <!-- metallic zipper slider -->
      <rect x="39" y="53" width="12" height="11" rx="2.5" fill="url(#zip_slider_${uid})" stroke="#334155" stroke-width="0.8"/>
      <rect x="41.5" y="55" width="7" height="3" rx="1" fill="#1e293b"/>
      <!-- zipper pull tab charm -->
      <path d="M42 63 L48 63 L49 76 C49 78 47 79 45 79 C43 79 41 78 41 76 Z" fill="url(#zip_slider_${uid})" stroke="#334155" stroke-width="0.8"/>
      <circle cx="45" cy="74" r="1.8" fill="#1e293b"/>
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
   * 7Z — High-tech precision compression vault with embossed 7Z insignia
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === '7Z' || format === '7ZIP') {
    const body = `
      <defs>
        <linearGradient id="sz_vault_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <!-- vault chassis -->
      <rect x="15" y="30" width="60" height="52" rx="6" fill="url(#sz_vault_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.85"/>
      <!-- inner perimeter bevel -->
      <rect x="19" y="34" width="52" height="44" rx="4" fill="none" stroke="${c}" stroke-width="1" stroke-opacity="0.3"/>
      <!-- corner hex bolts -->
      <circle cx="21" cy="36" r="2" fill="${c}" opacity="0.9"/>
      <circle cx="69" cy="36" r="2" fill="${c}" opacity="0.9"/>
      <circle cx="21" cy="76" r="2" fill="${c}" opacity="0.9"/>
      <circle cx="69" cy="76" r="2" fill="${c}" opacity="0.9"/>
      <!-- compression grille slots on left & right -->
      <line x1="22" y1="46" x2="28" y2="46" stroke="#0d1117" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <line x1="22" y1="56" x2="28" y2="56" stroke="#0d1117" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <line x1="22" y1="66" x2="28" y2="66" stroke="#0d1117" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <line x1="62" y1="46" x2="68" y2="46" stroke="#0d1117" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <line x1="62" y1="56" x2="68" y2="56" stroke="#0d1117" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <line x1="62" y1="66" x2="68" y2="66" stroke="#0d1117" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <!-- center vault lock medallion -->
      <rect x="33" y="42" width="24" height="28" rx="4" fill="#0d1117" stroke="${c}" stroke-width="1.5" stroke-opacity="0.9"/>
      <!-- stylized bold '7Z' insignia inside lock medallion -->
      <path d="M37 49 H45 L41 63" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M46 56 H53 L46 63 H53" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- top latch grip -->
      <rect x="38" y="27" width="14" height="4" rx="2" fill="${c}" opacity="0.8"/>
    `;
    return _base(uid, c, body, '7Z');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TAR — Dual-spool Unix magnetic tape cassette with viewing window
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'TAR') {
    const body = `
      <defs>
        <linearGradient id="tar_case_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <!-- cartridge body -->
      <rect x="14" y="32" width="62" height="50" rx="5" fill="url(#tar_case_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.8"/>
      <!-- top label / header strip -->
      <rect x="22" y="34" width="46" height="7" rx="2" fill="#0d1117" opacity="0.3"/>
      <!-- tape viewing window in center -->
      <rect x="22" y="45" width="46" height="24" rx="4" fill="#0d1117" stroke="${c}" stroke-width="1.2" stroke-opacity="0.5"/>
      <!-- left spool -->
      <circle cx="33" cy="57" r="8" fill="${c}" opacity="0.8"/>
      <circle cx="33" cy="57" r="4.5" fill="#0d1117"/>
      <circle cx="33" cy="57" r="1.8" fill="${c}"/>
      <!-- right spool -->
      <circle cx="57" cy="57" r="8" fill="${c}" opacity="0.8"/>
      <circle cx="57" cy="57" r="4.5" fill="#0d1117"/>
      <circle cx="57" cy="57" r="1.8" fill="${c}"/>
      <!-- tape ribbon connecting spools -->
      <line x1="33" y1="52" x2="57" y2="52" stroke="${c}" stroke-width="2.5" stroke-opacity="0.6"/>
      <!-- bottom guide rollers & screws -->
      <circle cx="18" cy="74" r="1.8" fill="${c}" opacity="0.8"/>
      <circle cx="72" cy="74" r="1.8" fill="${c}" opacity="0.8"/>
      <rect x="41" y="71" width="8" height="6" rx="1.5" fill="#0d1117" opacity="0.4"/>
    `;
    return _base(uid, c, body, 'TAR');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TAR.GZ — Tape cartridge secured with dual vertical compression straps
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'TAR.GZ') {
    const body = `
      <defs>
        <linearGradient id="tgz_case_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <!-- cartridge body -->
      <rect x="14" y="32" width="62" height="50" rx="5" fill="url(#tgz_case_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.8"/>
      <!-- tape viewing window -->
      <rect x="22" y="44" width="46" height="24" rx="4" fill="#0d1117" stroke="${c}" stroke-width="1.2" stroke-opacity="0.4"/>
      <!-- left spool -->
      <circle cx="33" cy="56" r="7.5" fill="${c}" opacity="0.8"/>
      <circle cx="33" cy="56" r="4" fill="#0d1117"/>
      <circle cx="33" cy="56" r="1.5" fill="${c}"/>
      <!-- right spool -->
      <circle cx="57" cy="56" r="7.5" fill="${c}" opacity="0.8"/>
      <circle cx="57" cy="56" r="4" fill="#0d1117"/>
      <circle cx="57" cy="56" r="1.5" fill="${c}"/>
      <!-- dual vertical compression straps -->
      <rect x="20" y="32" width="4" height="50" fill="#0d1117" opacity="0.35"/>
      <line x1="22" y1="32" x2="22" y2="82" stroke="${c}" stroke-width="1.5" stroke-opacity="0.8"/>
      <rect x="66" y="32" width="4" height="50" fill="#0d1117" opacity="0.35"/>
      <line x1="68" y1="32" x2="68" y2="82" stroke="${c}" stroke-width="1.5" stroke-opacity="0.8"/>
      <!-- center compression seal badge -->
      <rect x="38" y="50" width="14" height="12" rx="3" fill="#0d1117" stroke="${c}" stroke-width="1.5"/>
      <!-- dual inward compression arrows -->
      <path d="M41 56 H49 M43 54 L41 56 L43 58 M47 54 L49 56 L47 58" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    `;
    return _base(uid, c, body, 'TAR.GZ', true);
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * GZ — Pneumatic compression capsule with pressure bands & gauge seal
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'GZ') {
    const body = `
      <defs>
        <linearGradient id="gz_capsule_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <!-- capsule body -->
      <rect x="20" y="28" width="50" height="54" rx="14" fill="url(#gz_capsule_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.85"/>
      <!-- top pressure valve -->
      <rect x="39" y="24" width="12" height="5" rx="2" fill="${c}" stroke="${c}" stroke-width="1" opacity="0.9"/>
      <circle cx="45" cy="24" r="1.8" fill="#0d1117"/>
      <!-- horizontal pressure reinforcing bands -->
      <line x1="20" y1="40" x2="70" y2="40" stroke="#0d1117" stroke-width="2" opacity="0.35"/>
      <line x1="20" y1="70" x2="70" y2="70" stroke="#0d1117" stroke-width="2" opacity="0.35"/>
      <line x1="21" y1="40" x2="69" y2="40" stroke="${c}" stroke-width="1" stroke-opacity="0.6"/>
      <line x1="21" y1="70" x2="69" y2="70" stroke="${c}" stroke-width="1" stroke-opacity="0.6"/>
      <!-- central circular pressure gauge / seal -->
      <circle cx="45" cy="55" r="12" fill="#0d1117" stroke="${c}" stroke-width="1.8"/>
      <!-- inward pressure wave symbols -->
      <path d="M38 55 C38 52 42 52 45 55 C48 58 52 58 52 55" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="45" cy="50" r="1.6" fill="${c}"/>
      <circle cx="45" cy="60" r="1.6" fill="${c}"/>
    `;
    return _base(uid, c, body, 'GZ');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TAR.BZ2 / BZ2 — Industrial heavy archive with reinforced brackets & matrix
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'TAR.BZ2' || format === 'BZ2') {
    const isTarBz2 = format === 'TAR.BZ2';
    const body = `
      <defs>
        <linearGradient id="bz2_case_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.78"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <!-- container body -->
      <rect x="15" y="30" width="60" height="52" rx="5" fill="url(#bz2_case_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.85"/>
      <!-- reinforced corner brackets -->
      <path d="M15 38 V30 H23" fill="none" stroke="#0d1117" stroke-width="2.5" opacity="0.4"/>
      <path d="M75 38 V30 H67" fill="none" stroke="#0d1117" stroke-width="2.5" opacity="0.4"/>
      <path d="M15 74 V82 H23" fill="none" stroke="#0d1117" stroke-width="2.5" opacity="0.4"/>
      <path d="M75 74 V82 H67" fill="none" stroke="#0d1117" stroke-width="2.5" opacity="0.4"/>
      <!-- block sorting matrix texture -->
      <rect x="23" y="36" width="9" height="7" rx="1.5" fill="#0d1117" opacity="0.25"/>
      <rect x="35" y="36" width="9" height="7" rx="1.5" fill="#0d1117" opacity="0.25"/>
      <rect x="47" y="36" width="9" height="7" rx="1.5" fill="#0d1117" opacity="0.25"/>
      <rect x="59" y="36" width="9" height="7" rx="1.5" fill="#0d1117" opacity="0.25"/>
      <rect x="23" y="47" width="9" height="7" rx="1.5" fill="#0d1117" opacity="0.25"/>
      <rect x="35" y="47" width="9" height="7" rx="1.5" fill="#0d1117" opacity="0.25"/>
      <rect x="47" y="47" width="9" height="7" rx="1.5" fill="#0d1117" opacity="0.25"/>
      <rect x="59" y="47" width="9" height="7" rx="1.5" fill="#0d1117" opacity="0.25"/>
      <!-- heavy compression clamping crossbar -->
      <line x1="15" y1="60" x2="75" y2="60" stroke="${c}" stroke-width="2.5" stroke-opacity="0.9"/>
      <line x1="15" y1="60" x2="75" y2="60" stroke="#0d1117" stroke-width="1" stroke-dasharray="4 2" opacity="0.4"/>
      <!-- center pressure clamp screw -->
      <rect x="40" y="55" width="10" height="10" rx="2.5" fill="#0d1117" stroke="${c}" stroke-width="1.6"/>
      <circle cx="45" cy="60" r="2" fill="${c}"/>
      <!-- bottom ribbing -->
      <line x1="20" y1="74" x2="70" y2="74" stroke="${c}" stroke-width="1" stroke-opacity="0.35"/>
    `;
    return _base(uid, c, body, isTarBz2 ? 'TAR.BZ2' : 'BZ2', isTarBz2);
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TAR.XZ / XZ — Futuristic high-density crystalline container with LZMA core
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'TAR.XZ' || format === 'XZ') {
    const isTarXz = format === 'TAR.XZ';
    const body = `
      <defs>
        <linearGradient id="xz_case_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <!-- chassis body -->
      <rect x="15" y="30" width="60" height="52" rx="6" fill="url(#xz_case_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.85"/>
      <!-- top chamfer grip -->
      <path d="M35 30 L39 25 H51 L55 30 Z" fill="${c}" opacity="0.75"/>
      <!-- high-density LZMA compression crystal core -->
      <polygon points="45,36 63,56 45,76 27,56" fill="#0d1117" stroke="${c}" stroke-width="1.6"/>
      <!-- inner nested diamond -->
      <polygon points="45,43 55,56 45,69 35,56" fill="${c}" fill-opacity="0.2" stroke="${c}" stroke-width="1.2" stroke-opacity="0.6"/>
      <!-- center jewel pin -->
      <circle cx="45" cy="56" r="3" fill="${c}"/>
      <!-- lateral circuit traces / compression guides -->
      <line x1="19" y1="46" x2="27" y2="46" stroke="${c}" stroke-width="1.5" stroke-opacity="0.5"/>
      <line x1="19" y1="66" x2="27" y2="66" stroke="${c}" stroke-width="1.5" stroke-opacity="0.5"/>
      <line x1="63" y1="46" x2="71" y2="46" stroke="${c}" stroke-width="1.5" stroke-opacity="0.5"/>
      <line x1="63" y1="66" x2="71" y2="66" stroke="${c}" stroke-width="1.5" stroke-opacity="0.5"/>
    `;
    return _base(uid, c, body, isTarXz ? 'TAR.XZ' : 'XZ', isTarXz);
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * ISO — Optical master disc with data tracks & holographic sheen
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'ISO') {
    const body = `
      <defs>
        <radialGradient id="iso_disc_${uid}" cx="45%" cy="40%" r="55%">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.85"/>
          <stop offset="60%" stop-color="${c}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.3"/>
        </radialGradient>
        <linearGradient id="iso_sheen_${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
          <stop offset="50%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.35"/>
        </linearGradient>
      </defs>
      <!-- square protective sleeve backing -->
      <rect x="16" y="27" width="58" height="58" rx="6" fill="#0d1117" stroke="${c}" stroke-width="1.5" stroke-opacity="0.45" opacity="0.5"/>
      <!-- circular disc platter -->
      <circle cx="45" cy="56" r="25" fill="url(#iso_disc_${uid})" stroke="${c}" stroke-width="1.6"/>
      <!-- iridescent holographic sheen wedge -->
      <path d="M45 56 L31 35 A25 25 0 0 1 59 35 Z" fill="url(#iso_sheen_${uid})"/>
      <path d="M45 56 L31 77 A25 25 0 0 0 59 77 Z" fill="url(#iso_sheen_${uid})"/>
      <!-- concentric laser data tracks -->
      <circle cx="45" cy="56" r="20" fill="none" stroke="${c}" stroke-width="0.8" stroke-opacity="0.4"/>
      <circle cx="45" cy="56" r="15" fill="none" stroke="${c}" stroke-width="0.8" stroke-opacity="0.35"/>
      <!-- transparent hub area -->
      <circle cx="45" cy="56" r="9" fill="#0d1117" stroke="${c}" stroke-width="1.4"/>
      <!-- center spindle hole -->
      <circle cx="45" cy="56" r="4" fill="none" stroke="${c}" stroke-width="1.2" stroke-opacity="0.7"/>
    `;
    return _base(uid, c, body, 'ISO');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * DMG — Apple-style aluminum disk volume enclosure with virtual mount slot
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'DMG') {
    const body = `
      <defs>
        <linearGradient id="dmg_enclosure_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.78"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <!-- aluminum drive enclosure -->
      <rect x="15" y="30" width="60" height="52" rx="7" fill="url(#dmg_enclosure_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.85"/>
      <!-- front face plate -->
      <rect x="19" y="34" width="52" height="44" rx="4" fill="#0d1117" opacity="0.25"/>
      <!-- virtual disc slot -->
      <rect x="25" y="42" width="40" height="4" rx="2" fill="#0d1117" stroke="${c}" stroke-width="1" stroke-opacity="0.5"/>
      <!-- drive activity LED indicator -->
      <circle cx="28" cy="62" r="2.5" fill="${c}" stroke="#0d1117" stroke-width="0.8"/>
      <!-- virtual volume mount symbol (stylized disk with downward mount triangle) -->
      <ellipse cx="49" cy="59" rx="11" ry="3.5" fill="none" stroke="${c}" stroke-width="1.4"/>
      <path d="M49 53 V61 M46 58 L49 61 L52 58" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- subtle top grip / bevel line -->
      <line x1="22" y1="34" x2="68" y2="34" stroke="${c}" stroke-width="1" stroke-opacity="0.4"/>
    `;
    return _base(uid, c, body, 'DMG');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * CAB — Windows Cabinet archive dossier binder with dual compartments
   * ─────────────────────────────────────────────────────────────────────────── */
  if (format === 'CAB') {
    const body = `
      <defs>
        <linearGradient id="cab_case_${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <!-- cabinet dossier / binder body -->
      <rect x="15" y="29" width="60" height="53" rx="5" fill="url(#cab_case_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.85"/>
      <!-- top folder tab -->
      <path d="M19 29 V24 c0-2 1.5-3 3-3 h15 c2 0 3 1.5 4 3 L43 29 Z" fill="${c}" opacity="0.65"/>
      <!-- dossier horizontal seam / divider -->
      <line x1="15" y1="55" x2="75" y2="55" stroke="${c}" stroke-width="1.6" stroke-opacity="0.5"/>
      <!-- stitching accent lines -->
      <line x1="19" y1="36" x2="71" y2="36" stroke="${c}" stroke-width="1" stroke-opacity="0.25" stroke-dasharray="3 2"/>
      <line x1="19" y1="74" x2="71" y2="74" stroke="${c}" stroke-width="1" stroke-opacity="0.25" stroke-dasharray="3 2"/>
      <!-- twin cabinet drawer compartments -->
      <rect x="22" y="39" width="46" height="11" rx="2" fill="#0d1117" opacity="0.25"/>
      <rect x="22" y="59" width="46" height="11" rx="2" fill="#0d1117" opacity="0.25"/>
      <!-- drawer pull handles -->
      <rect x="38" y="42" width="14" height="4" rx="2" fill="${c}" opacity="0.9"/>
      <rect x="38" y="62" width="14" height="4" rx="2" fill="${c}" opacity="0.9"/>
    `;
    return _base(uid, c, body, 'CAB');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * Fallback — Archive security chest with lid plate & keyhole latch
   * ─────────────────────────────────────────────────────────────────────────── */
  const body = `
    <defs>
      <linearGradient id="fb_box_${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c}" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="${c}" stop-opacity="0.45"/>
      </linearGradient>
    </defs>
    <!-- chest body -->
    <rect x="15" y="34" width="60" height="48" rx="5" fill="url(#fb_box_${uid})" stroke="${c}" stroke-width="1.8" stroke-opacity="0.85"/>
    <!-- lid plate -->
    <path d="M15 44 H75 V36 C75 33 72 31 69 31 H21 C18 31 15 33 15 36 Z" fill="${c}" opacity="0.8"/>
    <line x1="15" y1="44" x2="75" y2="44" stroke="#0d1117" stroke-width="1.5" opacity="0.4"/>
    <!-- top handle -->
    <path d="M36 31 C36 26 54 26 54 31" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>
    <!-- center latch clasp plate -->
    <rect x="39" y="42" width="12" height="14" rx="2.5" fill="#0d1117" stroke="${c}" stroke-width="1.4"/>
    <!-- keyhole slot -->
    <circle cx="45" cy="48" r="1.8" fill="${c}"/>
    <line x1="45" y1="49" x2="45" y2="52" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>
    <!-- reinforcing horizontal rib -->
    <line x1="15" y1="64" x2="75" y2="64" stroke="${c}" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="3 2"/>
  `;
  return _base(uid, c, body, safeLabel, safeLabel.length > 5);
}
