const trustedExternalUrls = new Set([
  'https://www.texasinvasives.org/plant_database/detail.php?symbol=SOHA',
  'https://www.texasinvasives.org/plant_database/detail.php?symbol=TRSE6',
  'https://www.texasinvasives.org/plant_database/detail.php?symbol=RARU',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Sorghum%20halepense%20plant4%20NWS%20-%20Flickr%20-%20Macleay%20Grass%20Man.jpg?width=900',
  'https://commons.wikimedia.org/wiki/File:Sorghum_halepense_plant4_NWS_-_Flickr_-_Macleay_Grass_Man.jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/A%20forage%20plant.jpg?width=900',
  'https://commons.wikimedia.org/wiki/File:A_forage_plant.jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Sorghum%20Halepense%20Rhizome.jpg?width=800',
  'https://commons.wikimedia.org/wiki/File:Sorghum_Halepense_Rhizome.jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/ChineseTallowSeedpods.jpg?width=900',
  'https://commons.wikimedia.org/wiki/File:ChineseTallowSeedpods.jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Triadica%20sebifera-IMG%2020180531%20164952.jpg?width=900',
  'https://commons.wikimedia.org/wiki/File:Triadica_sebifera-IMG_20180531_164952.jpg',
  'https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/thumbnails/image/Triadica%20sebifera_2488.JPG',
  'https://www.usgs.gov/media/images/chinese-tallow-tree-triadica-sebifera',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Rapistrum%20rugosum%20leaf1%20%2814945663595%29.jpg?width=800',
  'https://commons.wikimedia.org/wiki/File:Rapistrum_rugosum_leaf1_(14945663595).jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Rapistrum%20rugosum%20flower1%20%2814759246657%29.jpg?width=900',
  'https://commons.wikimedia.org/wiki/File:Rapistrum_rugosum_flower1_(14759246657).jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Rapistrum%20rugosum%20fruit5%20%2814922739956%29.jpg?width=800',
  'https://commons.wikimedia.org/wiki/File:Rapistrum_rugosum_fruit5_(14922739956).jpg',
].map(url => new URL(url).toString()));

export function getSafeExternalUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;

  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== 'https:') return null;
    const normalized = url.toString();
    return trustedExternalUrls.has(normalized) ? normalized : null;
  } catch {
    return null;
  }
}
