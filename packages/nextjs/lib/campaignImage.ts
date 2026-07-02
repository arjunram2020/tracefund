// The Covenant.sol Campaign struct has no image field — campaigns are pure
// on-chain data with no media storage. To match the card/banner visual design,
// each campaign gets a deterministic photo picked by id from a curated set,
// so a given campaign always renders the same image.
const CAMPAIGN_PHOTOS = [
  "https://images.unsplash.com/photo-1563206767-5b18f218e8de?w=800&h=260&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1510566337590-2fc1f21d0faa?w=800&h=260&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=260&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1549692520-acc6669e2f0c?w=800&h=260&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1608306448197-e83633f1261c?w=800&h=260&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1759661881353-5b9cc55e1cf4?w=800&h=260&fit=crop&auto=format",
];

export function campaignPhoto(id: bigint | number): string {
  const i = Number(BigInt(id) % BigInt(CAMPAIGN_PHOTOS.length));
  return CAMPAIGN_PHOTOS[i];
}
