// Brand artwork per tenant. Star Valley Local's logo files live in public/brand; another tenant falls back to the generic mark and its name.
export interface BrandAssets { mark: { src: string; width: number; height: number }; lockup: { src: string; width: number; height: number } }
const ASSETS: Record<string, BrandAssets> = {
  "star-valley": {
    mark: { src: "/brand/star-valley-local-mark.png", width: 615, height: 384 },
    lockup: { src: "/brand/star-valley-local-lockup.png", width: 1085, height: 727 },
  },
};
export const brandAssets = (tenantSlug: string | null | undefined): BrandAssets | null => (tenantSlug ? ASSETS[tenantSlug] ?? null : null);
