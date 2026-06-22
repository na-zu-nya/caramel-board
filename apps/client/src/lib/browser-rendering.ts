export type UserAgentBrand = {
  brand: string;
  version?: string;
};

export type BrowserRenderingNavigator = {
  userAgent: string;
  userAgentData?: {
    brands?: readonly UserAgentBrand[];
  };
};

export type BrowserRenderingProfile = 'chrome';

export const resolveBrowserRenderingProfile = (
  navigatorLike: BrowserRenderingNavigator
): BrowserRenderingProfile | undefined => {
  const brands = navigatorLike.userAgentData?.brands;
  if (brands?.some(({ brand }) => brand === 'Google Chrome')) {
    return 'chrome';
  }

  const userAgent = navigatorLike.userAgent;
  if (/\bChrome\//.test(userAgent) && !/\b(Edg|OPR|CriOS)\//.test(userAgent)) {
    return 'chrome';
  }

  return undefined;
};

export const applyBrowserRenderingProfile = (
  targetDocument: Document,
  navigatorLike: BrowserRenderingNavigator
) => {
  const profile = resolveBrowserRenderingProfile(navigatorLike);
  if (profile) {
    targetDocument.documentElement.dataset.renderingProfile = profile;
    return;
  }

  delete targetDocument.documentElement.dataset.renderingProfile;
};
