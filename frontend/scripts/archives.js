/**
 * Archives category browser.
 * Convert category now shows 5 format families, each with live conversion sub-tools.
 */

import { setBreadcrumb } from './navigation.js';
import { isFavourite } from './favourites.js';
import { FAMILY_COLORS } from './toolFamily.js';
import { setActiveTool } from './toolstate.js';
import { getLockedModuleId } from './modulelock.js';
import { ARCHIVE_CONVERT_IDS } from '../tools/archives/archive_convert.js';

let _navigateToModule = null;
export function setNavigateToModule(fn) { _navigateToModule = fn; }

function _handleLockedClick(moduleId, toolLabel) {
  if (_navigateToModule) _navigateToModule(moduleId, toolLabel);
}

const COLORS = {
  archive: FAMILY_COLORS.archive,
  document: FAMILY_COLORS.document,
  image: FAMILY_COLORS.image,
  audio: FAMILY_COLORS.audio,
  video: FAMILY_COLORS.video,
  ebook: FAMILY_COLORS.ebook,
  data: FAMILY_COLORS.data,
  pink: '#F472B6',
  cyan: '#00E5C0',
  navy: '#0d0d1a',
};

const COLOR_BACKGROUNDS = {
  [COLORS.archive]: 'rgba(132,204,22,0.15)',
  [COLORS.document]: 'rgba(255,107,107,0.15)',
  [COLORS.image]: 'rgba(167,139,250,0.15)',
  [COLORS.audio]: 'rgba(251,146,60,0.15)',
  [COLORS.video]: 'rgba(56,189,248,0.15)',
  [COLORS.ebook]: 'rgba(251,191,36,0.15)',
  [COLORS.data]: 'rgba(45,212,191,0.15)',
  [COLORS.pink]: 'rgba(244,114,182,0.15)',
  [COLORS.cyan]: 'rgba(0,229,192,0.15)',
  '#EF4444': 'rgba(239,68,68,0.15)',
  '#06B6D4': 'rgba(6,182,212,0.15)',
  '#22C55E': 'rgba(34,197,94,0.15)',
  '#8B5CF6': 'rgba(139,92,246,0.15)',
  '#F59E0B': 'rgba(245,158,11,0.15)',
};

const ICONS = {
  archive: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7.5h16v11H4zM4 7.5 6 4h12l2 3.5M9 11h6M10 15h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  extract: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10.5H4zM4 8l2-3h12l2 3M12 10v6m0 0-2.5-2.5M12 16l2.5-2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  convert: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3M18 7a6 6 0 0 1 1 6M6 17a6 6 0 0 1-1-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  utility: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14.5 6.5 3-3 3 3-3 3M5 19l8.5-8.5M13.5 5.5a5 5 0 0 0 5 5M7 4.5l1.5 1.5-2 2L5 6.5zM17.5 15l2 2-3 3-2-2z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 16h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17zM3.5 6.5v-1h6l2 2" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
};

const TOOL_ICONS = [
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14v12H5zM5 7l2-3h10l2 3M9 11h6M10 15h4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16v13H4zM4 6h6l2 3h8M8 13h8M8 16h5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v11H4zM4 8l2-3h12l2 3M7 12h10M7 15h7" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v11H4zM4 8l2-3h12l2 3M8 12h8M8 15h5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="17" cy="15" r="1" fill="currentColor"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16v12H4zM4 7l2-3h12l2 3M8 11h8M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 8h18v11H3zM3 8l3-3h6l2 3M8 12h8M8 15h6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 8h18v11H3zM3 8l3-3h6l2 3M8 12h8M12 12v4m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16v12H4zM4 7l2-3h12l2 3M8 11h8M8 15h8" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m9 13 3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2.5-2.5M12 16l2.5-2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="12" r="1" fill="currentColor"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="12" r="1" fill="currentColor"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 12h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 12h3m4 0h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 2"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12h2m4 0h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="m8 13 2 2m4-2 2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="m8 15 2-2m4 2 2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="1.4"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12h6m-4 3h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16v10H4zM4 8l2-3h12l2 3M12 11v5m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 12h8m-5 3h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="1 2"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h10v12H7zM7 7l2-3h6l2 3M12 10v6m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 13h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h10v12H7zM7 7l2-3h6l2 3M12 10v6m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="m9 14 3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h10v12H7zM7 7l2-3h6l2 3M12 10v6m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="m9 12 3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h10v12H7zM7 7l2-3h6l2 3M12 10v6m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 13h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 2"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h10v12H7zM7 7l2-3h6l2 3M12 10v6m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12h2m2 0h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5h14v14H5zM9 5v14M5 10h14" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m12 13 2 2 3-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5h14v14H5zM9 5v14M5 10h14" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 12h5m-5 3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16v13H4zM8 6V4h8v2M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16v13H4zM8 6V4h8v2M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M16 13v4m0 0-2-2m2 2 2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16v13H4zM8 6V4h8v2M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m15 13 2 2 2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="5" stroke="currentColor" stroke-width="1.7"/><path d="m14 14 5 5M8 10h4M10 8v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5h14v14H5zM9 9h6v6H9z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9v6M9 12h6" stroke="currentColor" stroke-width="1.4"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5h14v14H5zM9 9h6v6H9z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m8 8 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 11V7a6 6 0 0 1 12 0v4M4 11h16v8H4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="15" r="1" fill="currentColor"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 11V7a6 6 0 0 1 12 0v4M4 11h16v8H4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 15h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h12v14H4zM16 9l4-2v10l-4-2" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m8 9 2 2 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3 2M9 4l-2-2M15 4l2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5h14v14H5z" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="10" r="1.5" stroke="currentColor" stroke-width="1.4"/><circle cx="15" cy="14" r="1.5" stroke="currentColor" stroke-width="1.4"/><path d="m10.5 10 3 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
];

const CATEGORIES = [
  {
    id: 'compress-create',
    label: 'Create Tools',
    desc: 'ZIP, TAR, 7Z, RAR, WIM, ISO & more',
    icon: ICONS.archive,
    color: COLORS.ebook,
    bg: COLOR_BACKGROUNDS[COLORS.ebook],
    tag: 'Create',
    tools: [
      ['Files to ZIP',     'Create a ZIP archive from selected files.'],
      ['Files to TAR',     'Bundle selected files into a TAR archive.'],
      ['Files to TAR.GZ',  'Create a compressed TAR.GZ archive.'],
      ['Files to TAR.BZ2', 'Create a BZIP2-compressed TAR archive.'],
      ['Files to 7Z',      'Create a 7Z archive from selected files.'],
      ['Folder to ZIP',    'Compress a folder into a ZIP archive.'],
      ['Folder to 7Z',     'Compress a folder into a 7Z archive.'],
      ['Files to RAR',     'Create a RAR archive from selected files.'],
      ['Files to TAR.XZ',  'Create a high-compression TAR.XZ archive.'],
      ['Files to WIM',     'Create a Windows Imaging Format (WIM) archive.'],
    ],
  },
  {
    id: 'extract',
    label: 'Extract Tools',
    desc: 'ZIP, RAR, 7Z, TAR & more',
    icon: ICONS.extract,
    color: COLORS.cyan,
    bg: COLOR_BACKGROUNDS[COLORS.cyan],
    tag: 'Extract',
    tools: [
      ['ZIP Extract', 'Extract files from a ZIP archive.'],
      ['RAR Extract', 'Extract files from a RAR archive.'],
      ['7Z Extract', 'Extract files from a 7Z archive.'],
      ['TAR Extract', 'Extract files from a TAR archive.'],
      ['TAR.GZ Extract', 'Extract files from a TAR.GZ archive.'],
      ['TAR.BZ2 Extract', 'Extract files from a TAR.BZ2 archive.'],
      ['TAR.XZ Extract', 'Extract files from a TAR.XZ archive.'],
      ['GZ Extract', 'Extract files from a GZ archive.'],
      ['BZ2 Extract', 'Extract files from a BZ2 archive.'],
      ['XZ Extract', 'Extract files from an XZ archive.'],
      ['CAB Extract', 'Extract files from a CAB archive.'],
      ['DMG Extract', 'Extract files from a DMG image.'],
    ],
  },
  {
    id: 'convert',
    label: 'Convert Tools',
    desc: 'ZIP to 7Z, RAR to ZIP & more',
    icon: ICONS.convert,
    color: COLORS.video,
    bg: COLOR_BACKGROUNDS[COLORS.video],
    tag: 'Convert',
    tools: [
      ['ZIP to 7Z', 'Convert a ZIP archive into 7Z format.'],
      ['ZIP to TAR.GZ', 'Convert a ZIP archive into TAR.GZ format.'],
      ['RAR to ZIP', 'Convert a RAR archive into ZIP format.'],
      ['7Z to ZIP', 'Convert a 7Z archive into ZIP format.'],
      ['TAR to ZIP', 'Convert a TAR archive into ZIP format.'],
      ['TAR.GZ to ZIP', 'Convert a TAR.GZ archive into ZIP format.'],
    ],
  },
  {
    id: 'utility',
    label: 'Utility Tools',
    desc: 'Inspect, split, merge, protect & more',
    icon: ICONS.utility,
    color: COLORS.image,
    bg: COLOR_BACKGROUNDS[COLORS.image],
    tag: 'Utility',
    tools: [
      ['Archive Inspector', 'Inspect archive contents and metadata.'],
      ['Archive Splitter', 'Split a large archive into smaller parts.'],
      ['Archive Merger', 'Merge archive parts into one archive.'],
      ['Password Protect ZIP', 'Add password protection to a ZIP archive.'],
      ['Remove ZIP Password', 'Remove a password from a ZIP archive.'],
      ['Repair Corrupted ZIP', 'Attempt recovery of a corrupted ZIP archive.'],
      ['Archive Size Estimator', 'Estimate the compressed size of selected files.'],
      ['Duplicate Finder in Archive', 'Find duplicate files inside an archive.'],
    ],
  },
];

// ─── ARCHIVE CONVERT CATEGORY DEFINITIONS ────────────────────────────────────

const CONVERT_CATEGORIES = [
  {
    id: 'conv-zip',
    label: 'ZIP Convert Tools',
    desc: 'Convert ZIP archives to 7Z, TAR, TAR.GZ, and RAR.',
    color: COLORS.archive,           // #84CC16 — lime
    bg: COLOR_BACKGROUNDS[COLORS.archive],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.zip',
    tools: [
      { id: 'arc-zip-to-7z',     label: 'ZIP to 7Z',     desc: 'Convert a ZIP archive into 7Z format.',    dstExt: '.7z',     color: COLORS.archive },
      { id: 'arc-zip-to-tar',    label: 'ZIP to TAR',    desc: 'Convert a ZIP archive into TAR format.',   dstExt: '.tar',    color: COLORS.data },
      { id: 'arc-zip-to-tar-gz', label: 'ZIP to TAR.GZ', desc: 'Convert a ZIP archive into TAR.GZ format.',dstExt: '.tar.gz', color: COLORS.audio },
      { id: 'arc-zip-to-rar',    label: 'ZIP to RAR',    desc: 'Convert a ZIP archive into RAR format.',   dstExt: '.rar',    color: COLORS.document },
    ],
  },
  {
    id: 'conv-tar',
    label: 'TAR Convert Tools',
    desc: 'Convert TAR archives to ZIP, 7Z, GZ, and RAR.',
    color: COLORS.data,              // #2DD4BF — teal
    bg: COLOR_BACKGROUNDS[COLORS.data],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.tar',
    tools: [
      { id: 'arc-tar-to-zip', label: 'TAR to ZIP', desc: 'Convert a TAR archive into ZIP format.', dstExt: '.zip', color: COLORS.archive },
      { id: 'arc-tar-to-7z',  label: 'TAR to 7Z',  desc: 'Convert a TAR archive into 7Z format.',  dstExt: '.7z',  color: COLORS.data },
      { id: 'arc-tar-to-gz',  label: 'TAR to GZ',  desc: 'Convert a TAR archive into GZ format.',  dstExt: '.gz',  color: COLORS.audio },
      { id: 'arc-tar-to-rar', label: 'TAR to RAR', desc: 'Convert a TAR archive into RAR format.', dstExt: '.rar', color: COLORS.ebook },
    ],
  },
  {
    id: 'conv-7z',
    label: '7Z Convert Tools',
    desc: 'Convert 7Z archives to ZIP, TAR, TAR.GZ, and RAR.',
    color: COLORS.image,             // #A78BFA — violet
    bg: COLOR_BACKGROUNDS[COLORS.image],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.7z',
    tools: [
      { id: 'arc-7z-to-zip',    label: '7Z to ZIP',    desc: 'Convert a 7Z archive into ZIP format.',     dstExt: '.zip',    color: COLORS.image },
      { id: 'arc-7z-to-tar',    label: '7Z to TAR',    desc: 'Convert a 7Z archive into TAR format.',     dstExt: '.tar',    color: COLORS.data },
      { id: 'arc-7z-to-tar-gz', label: '7Z to TAR.GZ', desc: 'Convert a 7Z archive into TAR.GZ format.',  dstExt: '.tar.gz', color: COLORS.audio },
      { id: 'arc-7z-to-rar',    label: '7Z to RAR',    desc: 'Convert a 7Z archive into RAR format.',     dstExt: '.rar',    color: '#EF4444' },
    ],
  },
  {
    id: 'conv-tar-gz',
    label: 'TAR.GZ Convert Tools',
    desc: 'Convert TAR.GZ archives to ZIP, 7Z, TAR, and RAR.',
    color: COLORS.audio,             // #FB923C — orange
    bg: COLOR_BACKGROUNDS[COLORS.audio],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.tar.gz',
    tools: [
      { id: 'arc-tar-gz-to-zip', label: 'TAR.GZ to ZIP', desc: 'Convert a TAR.GZ archive into ZIP format.', dstExt: '.zip', color: COLORS.archive },
      { id: 'arc-tar-gz-to-7z',  label: 'TAR.GZ to 7Z',  desc: 'Convert a TAR.GZ archive into 7Z format.',  dstExt: '.7z',  color: COLORS.image },
      { id: 'arc-tar-gz-to-tar', label: 'TAR.GZ to TAR', desc: 'Convert a TAR.GZ archive into TAR format.', dstExt: '.tar', color: COLORS.audio },
      { id: 'arc-tar-gz-to-rar', label: 'TAR.GZ to RAR', desc: 'Convert a TAR.GZ archive into RAR format.', dstExt: '.rar', color: COLORS.data },
    ],
  },
  {
    id: 'conv-rar',
    label: 'RAR Convert Tools',
    desc: 'Convert RAR archives to ZIP, 7Z, TAR, and TAR.GZ.',
    color: COLORS.document,          // #FF6B6B — red
    bg: COLOR_BACKGROUNDS[COLORS.document],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.rar',
    tools: [
      { id: 'arc-rar-to-zip',    label: 'RAR to ZIP',    desc: 'Convert a RAR archive into ZIP format.',    dstExt: '.zip',    color: COLORS.archive },
      { id: 'arc-rar-to-7z',     label: 'RAR to 7Z',     desc: 'Convert a RAR archive into 7Z format.',     dstExt: '.7z',     color: COLORS.image },
      { id: 'arc-rar-to-tar',    label: 'RAR to TAR',    desc: 'Convert a RAR archive into TAR format.',    dstExt: '.tar',    color: COLORS.data },
      { id: 'arc-rar-to-tar-gz', label: 'RAR to TAR.GZ', desc: 'Convert a RAR archive into TAR.GZ format.', dstExt: '.tar.gz', color: COLORS.audio },
    ],
  },
];

// Enrich each sub-tool with bg + icon
CONVERT_CATEGORIES.forEach((cat) => {
  cat.tools = cat.tools.map((t) => ({
    ...t,
    bg: COLOR_BACKGROUNDS[t.color] || `rgba(128,128,128,0.15)`,
    icon: ICONS.convert,
    mainText: `Drop ${t.label.split(' to ')[0]} archive to convert`,
    subText: 'or click to browse',
    tag: 'Convert',
  }));
});

function backIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function _tagClass(tag) {
  const t = (tag || '').toLowerCase();
  if (t === 'convert') return 'convert';
  if (t === 'create')  return 'create';
  if (t === 'extract') return 'extract';
  if (t === 'utility') return 'utility';
  return 'tool';
}

function cardHTML(item, tag, showFavorite = false) {
  const resolvedTag = tag || item.tag || '';
  const favorite = showFavorite && isFavourite(item.id);
  const starTitle = favorite ? 'Remove from Favourites' : 'Add to Favourites';
  const lockedModule = getLockedModuleId(item.id);
  const lockClass = lockedModule ? ' fmt-card--locked' : '';
  const lockedAttr = lockedModule ? ` data-locked-module="${lockedModule}"` : '';
  const star = showFavorite
    ? `<button class="card-fav-btn${favorite ? ' is-favourite' : ''}" type="button" title="${starTitle}" aria-label="${starTitle}" data-fav-id="${item.id}">${favorite ? '★' : '☆'}</button>`
    : '';
  return `<div class="fmt-card${lockClass}" data-id="${item.id}"${lockedAttr} style="--fmt-color:${item.color};--fmt-bg:${item.bg}">
    <div class="fmt-card-top">
      <div class="fmt-icon-box">${item.icon}</div>
      <span class="fmt-arrow" aria-hidden="true">›</span>
    </div>
    <div class="fmt-label" title="${item.label}">${item.label}</div>
    <div class="fmt-desc" title="${item.desc}">${item.desc}</div>
    ${resolvedTag ? `<div class="fmt-tag fmt-tag--${_tagClass(resolvedTag)}">${resolvedTag}</div>` : ''}
    ${star}
  </div>`;
}

function categoryCardHTML(category) {
  return cardHTML({ ...category, icon: category.icon }, category.tag || '', false);
}

function scrollToArchiveTools() {
  setTimeout(() => {
    const mainContent = document.getElementById('main-content');
    const exploreSection = document.getElementById('explore-section');
    if (mainContent && exploreSection) {
      mainContent.scrollTo({
        top: Math.max(0, exploreSection.offsetTop - 16),
        behavior: 'smooth',
      });
    }
  }, 60);
}

function scrollToDropZone() {
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
}

function toolRecords(category) {
  const archiveCreateIds = [
    'archive-files-zip', 'archive-files-tar', 'archive-files-tar-gz', 'archive-files-tar-bz2',
    'archive-files-7z', 'archive-folder-zip', 'archive-folder-7z',
    'archive-files-rar', 'archive-files-tar-xz',
    'archive-files-wim',
  ];
  const archiveExtractIds = [
    'archive-extract-zip', 'archive-extract-rar', 'archive-extract-7z', 'archive-extract-tar',
    'archive-extract-tar-gz', 'archive-extract-tar-bz2', 'archive-extract-tar-xz', 'archive-extract-gz',
    'archive-extract-bz2', 'archive-extract-xz', 'archive-extract-cab',
    'archive-extract-dmg',
  ];
  const iconOffsets = {
    'compress-create': 0,
    extract: 8,
    convert: 21,
    utility: 27,
  };
  const toolColors = {
    'compress-create': [
      COLORS.pink, COLORS.data, COLORS.audio, COLORS.document, COLORS.archive, COLORS.video, COLORS.ebook, COLORS.image,
      '#EF4444', '#06B6D4', '#22C55E', '#8B5CF6', '#F59E0B',
    ],
    extract: [COLORS.archive, COLORS.document, COLORS.image, COLORS.audio, COLORS.video, COLORS.ebook, COLORS.data, COLORS.archive, COLORS.audio, COLORS.video, COLORS.document, COLORS.image, COLORS.ebook],
    convert: [COLORS.archive, COLORS.document, COLORS.audio, COLORS.image, COLORS.data, COLORS.video],
    utility: [COLORS.archive, COLORS.image, COLORS.audio, COLORS.document, COLORS.data, COLORS.video, COLORS.ebook, COLORS.cyan],
  };
  return category.tools.map(([label, desc], index) => {
    const color = toolColors[category.id][index];
    const bg = COLOR_BACKGROUNDS[color] || `rgba(128,128,128,0.15)`;
    return {
    id: category.id === 'compress-create'
      ? archiveCreateIds[index]
      : (category.id === 'extract' ? archiveExtractIds[index] : `${category.id}-${index + 1}`),
    label,
    desc,
    icon: TOOL_ICONS[iconOffsets[category.id] + index],
    color,
    bg,
    mainText: category.id === 'compress-create'
      ? 'Drop files to archive'
      : (category.id === 'extract' ? `Drop ${label.replace(' Extract', '')} archive to extract` : 'Drop a file to begin'),
    subText: 'or click to browse',
    };
  });
}

// ─── CONVERT CATEGORY LANDING (5 family cards) ───────────────────────────────

function renderConvertLanding(container, activateNav) {
  setActiveTool(null);
  const convertCat = CATEGORIES.find((c) => c.id === 'convert');
  setBreadcrumb(['Dashboard', 'Archives', 'Convert Tools']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Archives">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${convertCat.bg};color:${convertCat.color}">${convertCat.icon}</div>
      <span class="explore-title">Archives — Convert</span>
    </div>
    <div class="fmt-grid archive-tool-grid">
      ${CONVERT_CATEGORIES.map((c) => cardHTML(c, 'Convert', false)).join('')}
    </div>
  `;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => renderLanding(container, activateNav));
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      const convCat = CONVERT_CATEGORIES.find((c) => c.id === card.dataset.id);
      if (convCat) {
        renderConvertSubTools(container, activateNav, convCat);
        scrollToArchiveTools();
      }
    });
  });
}

// ─── CONVERT SUB-TOOLS (4 conversion pair cards per family) ──────────────────

function renderConvertSubTools(container, activateNav, convCat) {
  setActiveTool(null);
  setBreadcrumb(['Dashboard', 'Archives', 'Convert', convCat.label]);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Convert">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${convCat.bg};color:${convCat.color}">${convCat.icon}</div>
      <span class="explore-title">Archives — ${convCat.label}</span>
    </div>
    <div class="fmt-grid archive-tool-grid">
      ${convCat.tools.map((t) => cardHTML(t, 'Convert', true)).join('')}
    </div>
  `;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => renderConvertLanding(container, activateNav));

  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      const tool = convCat.tools.find((t) => t.id === card.dataset.id);
      if (!tool) return;
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      // Select card + activate tool → dropzone will be updated
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      setActiveTool(tool);
      scrollToDropZone();
    });
  });
}

// ─── STANDARD CATEGORY LANDING ───────────────────────────────────────────────

function renderLanding(container, activateNav) {
  setActiveTool(null);
  setBreadcrumb(['Dashboard', 'Archives']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Dashboard">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${COLOR_BACKGROUNDS[COLORS.archive]};color:${COLORS.archive}">${ICONS.archive}</div>
      <span class="explore-title">Archives — Choose a category</span>
    </div>
    <div class="fmt-grid archive-category-grid">
      ${CATEGORIES.map(categoryCardHTML).join('')}
    </div>
  `;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Dashboard'));
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      const category = CATEGORIES.find((item) => item.id === card.dataset.id);
      if (category) {
        if (category.id === 'convert') {
          renderConvertLanding(container, activateNav);
        } else {
          renderCategory(container, activateNav, category);
        }
        scrollToArchiveTools();
      }
    });
  });
}

function renderCategory(container, activateNav, category) {
  setActiveTool(null);
  const tools = toolRecords(category);
  setBreadcrumb(['Dashboard', 'Archives', category.label]);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Archives">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${category.bg};color:${category.color}">${category.icon}</div>
      <span class="explore-title">Archives — ${category.label.replace(' Tools', '')}</span>
    </div>
    <div class="fmt-grid archive-tool-grid">
      ${tools.map((tool) => {
        let toolTag = 'Tool';
        if (category.id === 'compress-create') toolTag = 'Create';
        else if (category.id === 'extract') toolTag = 'Extract';
        else if (category.id === 'convert') toolTag = 'Convert';
        else if (category.id === 'utility') toolTag = 'Utility';
        return cardHTML(tool, toolTag, true);
      }).join('')}
    </div>
  `;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => renderLanding(container, activateNav));
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      const tool = tools.find((item) => item.id === card.dataset.id);
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      if (tool && (category.id === 'compress-create' || category.id === 'extract')) {
        container.querySelectorAll('.fmt-card').forEach((item) => item.classList.remove('selected'));
        card.classList.add('selected');
        setActiveTool(tool);
        scrollToDropZone();
      } else if (tool) {
        renderPlaceholder(container, activateNav, category, tool);
      }
    });
  });
}

function renderPlaceholder(container, activateNav, category, tool) {
  setBreadcrumb(['Dashboard', 'Archives', category.label, tool.label]);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to ${category.label}">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${tool.bg};color:${tool.color}">${tool.icon}</div>
      <span class="explore-title">${tool.label}</span>
    </div>
    <div class="archive-placeholder" style="--fmt-color:${tool.color};--fmt-bg:${tool.bg}">
      <div class="tool-icon-box">${tool.icon}</div>
      <h3>${tool.label}</h3>
      <p>${tool.desc}</p>
      <span class="fmt-tag">Tool panel coming soon</span>
    </div>
  `;
  container.querySelector('.fmt-back-btn').addEventListener('click', () => renderCategory(container, activateNav, category));
}

export function renderArchives(container, activateNav) {
  renderLanding(container, activateNav);
}
