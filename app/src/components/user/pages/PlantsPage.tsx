// components/user/pages/PlantsPage.jsx
import { Leaf } from 'lucide-react';
import { getSafeExternalUrl } from '../../../utils/safeExternalPlantUrls';

const invasivePlants = [
  {
    scientificName: 'Sorghum halepense',
    commonName: 'Johnsongrass / Johnson grass',
    sourceUrl: 'https://www.texasinvasives.org/plant_database/detail.php?symbol=SOHA',
    sourceLabel: 'TexasInvasives.org profile',
    description: 'A tall perennial grass that spreads through thick rhizomes and seed, often forming fast-growing colonies in disturbed soils, ditches, fields, and moist banks.',
    identification: 'Look for broad leaves with a pale midrib, coarse stems up to about 6 feet, vigorous underground rhizomes, and loose reddish to purplish seed panicles.',
    invasiveReason: 'It spreads by rhizomes, seed, water, animals, and equipment, allowing it to crowd native grasses and forbs along waterway edges and disturbed Central Texas sites.',
    seasonalImages: [
      {
        season: 'Warm-season growth',
        src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sorghum%20halepense%20plant4%20NWS%20-%20Flickr%20-%20Macleay%20Grass%20Man.jpg?width=900',
        alt: 'Johnsongrass foliage and upright stems during warm-season growth',
        credit: 'Harry Rose, CC BY 2.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sorghum_halepense_plant4_NWS_-_Flickr_-_Macleay_Grass_Man.jpg',
      },
      {
        season: 'Late summer seedheads',
        src: 'https://commons.wikimedia.org/wiki/Special:FilePath/A%20forage%20plant.jpg?width=900',
        alt: 'Johnsongrass seedhead and leaves',
        credit: 'Goodymeraj, CC0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:A_forage_plant.jpg',
      },
      {
        season: 'Fall rhizomes',
        src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sorghum%20Halepense%20Rhizome.jpg?width=800',
        alt: 'Johnsongrass rhizome pulled from soil',
        credit: 'Moadeeb, CC BY-SA 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sorghum_Halepense_Rhizome.jpg',
      },
    ],
  },
  {
    scientificName: 'Triadica sebifera',
    commonName: 'Chinese tallow tree',
    sourceUrl: 'https://www.texasinvasives.org/plant_database/detail.php?symbol=TRSE6',
    sourceLabel: 'TexasInvasives.org profile',
    description: 'A fast-growing deciduous tree that favors stream banks, wet ditches, flood-tolerant sites, and disturbed edges.',
    identification: 'Look for heart- to diamond-shaped leaves, dangling yellowish flower spikes, milky sap, bright fall color, and white popcorn-like seeds after the capsules split.',
    invasiveReason: 'It produces seed early and heavily, spreads by birds and water, and can convert diverse riparian habitat into dense single-species stands.',
    seasonalImages: [
      {
        season: 'Spring pods and flowers',
        src: 'https://commons.wikimedia.org/wiki/Special:FilePath/ChineseTallowSeedpods.jpg?width=900',
        alt: 'Chinese tallow spring seed pods and new inflorescence',
        credit: 'DanielCD, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:ChineseTallowSeedpods.jpg',
      },
      {
        season: 'Summer leaves',
        src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Triadica%20sebifera-IMG%2020180531%20164952.jpg?width=900',
        alt: 'Chinese tallow summer leaves',
        credit: 'Sun Jiao, CC BY 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Triadica_sebifera-IMG_20180531_164952.jpg',
      },
      {
        season: 'Fall color',
        src: 'https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/thumbnails/image/Triadica%20sebifera_2488.JPG',
        alt: 'Chinese tallow tree with red fall leaves',
        credit: 'Larry Allain, public domain',
        sourceUrl: 'https://www.usgs.gov/media/images/chinese-tallow-tree-triadica-sebifera',
      },
    ],
  },
  {
    scientificName: 'Rapistrum rugosum',
    commonName: 'Bastard cabbage / Turnipweed',
    sourceUrl: 'https://www.texasinvasives.org/plant_database/detail.php?symbol=RARU',
    sourceLabel: 'TexasInvasives.org profile',
    description: 'A cool-season annual mustard that thrives in disturbed soil, roadsides, ditches, fields, and open natural areas.',
    identification: 'Look for a leafy basal rosette, deep green wrinkled leaves, small yellow four-petaled flowers, and two-segment seed pods with a beaked tip.',
    invasiveReason: 'Its early rosettes can blanket the ground, block light from native seedlings, and form dense spring stands along disturbed Central Texas corridors.',
    seasonalImages: [
      {
        season: 'Winter rosette leaves',
        src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Rapistrum%20rugosum%20leaf1%20%2814945663595%29.jpg?width=800',
        alt: 'Bastard cabbage lobed basal leaf',
        credit: 'Harry Rose, CC BY 2.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rapistrum_rugosum_leaf1_(14945663595).jpg',
      },
      {
        season: 'Spring flowers',
        src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Rapistrum%20rugosum%20flower1%20%2814759246657%29.jpg?width=900',
        alt: 'Bastard cabbage yellow flowers',
        credit: 'Harry Rose, CC BY 2.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rapistrum_rugosum_flower1_(14759246657).jpg',
      },
      {
        season: 'Summer seed pods',
        src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Rapistrum%20rugosum%20fruit5%20%2814922739956%29.jpg?width=800',
        alt: 'Bastard cabbage two-segment fruit pods',
        credit: 'Harry Rose, CC BY 2.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rapistrum_rugosum_fruit5_(14922739956).jpg',
      },
    ],
  },
];

export default function PlantsPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          <Leaf className="text-emerald-600" />
          Plant ID Guide
        </h2>
        <p className="text-gray-600 max-w-3xl">
          Priority invasive plants for the Tillery Fields restoration area, with seasonal field cues and local impact notes.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {invasivePlants.map(plant => {
          const safePlantSourceUrl = getSafeExternalUrl(plant.sourceUrl);

          return (
            <article key={plant.scientificName} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex flex-col">
              <div className="grid grid-cols-3 gap-px bg-gray-100">
                {plant.seasonalImages.map(image => {
                const safeImageSrc = getSafeExternalUrl(image.src);
                const safeSourceUrl = getSafeExternalUrl(image.sourceUrl);
                const figureContent = (
                  <>
                    <div className="aspect-square bg-emerald-50 overflow-hidden">
                      {safeImageSrc && (
                        <img
                          src={safeImageSrc}
                          alt={image.alt}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                    <figcaption className="px-2 py-2 min-h-16">
                      <span className="block text-[11px] font-semibold text-gray-900 leading-tight">{image.season}</span>
                      <span className="block mt-1 text-[10px] text-gray-500 leading-tight">{image.credit}</span>
                    </figcaption>
                  </>
                );

                return (
                  <figure key={image.season} className="bg-white">
                    {safeSourceUrl
                      ? (
                        <a
                          href={safeSourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                          className="block"
                        >
                          {figureContent}
                        </a>
                      )
                      : figureContent}
                  </figure>
                );
              })}
              </div>
              <div className="p-5 flex flex-col gap-4 flex-1">
                <div>
                  <p className="text-sm font-semibold text-emerald-700">{plant.commonName}</p>
                  <h3 className="text-xl font-bold italic text-gray-900">{plant.scientificName}</h3>
                </div>

                <p className="text-sm text-gray-600 leading-6">{plant.description}</p>

                <div className="space-y-3 text-sm text-gray-700">
                  <div>
                    <h4 className="font-semibold text-gray-900">Identification</h4>
                    <p className="mt-1 leading-6">{plant.identification}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Why it is invasive here</h4>
                    <p className="mt-1 leading-6">{plant.invasiveReason}</p>
                  </div>
                </div>

                <div className="mt-auto pt-2 text-xs text-gray-500">
                  {safePlantSourceUrl && (
                    <a
                      href={safePlantSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                      className="font-medium text-teal-700 hover:text-teal-900 underline underline-offset-2"
                    >
                      {plant.sourceLabel}
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
