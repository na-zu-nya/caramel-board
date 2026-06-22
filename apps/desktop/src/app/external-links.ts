const DESKTOP_TOOLS_WINDOWS_GUIDE_URL =
  'https://github.com/na-zu-nya/caramel-board/blob/main/docs/desktop-tools-windows.md';
const DESKTOP_TOOLS_MACOS_GUIDE_URL =
  'https://github.com/na-zu-nya/caramel-board/blob/main/docs/desktop-tools-macos.md';

export const FFMPEG_OFFICIAL_URL = 'https://ffmpeg.org/download.html';

const POPPLER_WINDOWS_OFFICIAL_URL = 'https://github.com/oschwartz10612/poppler-windows/releases';
const POPPLER_MACOS_OFFICIAL_URL = 'https://formulae.brew.sh/formula/poppler';

const isMacPlatform = () => navigator.platform.toLowerCase().includes('mac');

export const getDesktopToolsGuideUrl = () =>
  isMacPlatform() ? DESKTOP_TOOLS_MACOS_GUIDE_URL : DESKTOP_TOOLS_WINDOWS_GUIDE_URL;

export const getPopplerOfficialUrl = () =>
  isMacPlatform() ? POPPLER_MACOS_OFFICIAL_URL : POPPLER_WINDOWS_OFFICIAL_URL;
