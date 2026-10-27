export type SiteContent = {
  mission: string;
  goals: string;
  about: {
    name: string;
    bio: string;
    imageUrl: string;
    imagePath: string;
  };
};

const DEFAULT_RESTORATION_GOALS = [
  'Clean trash from the stormwater channel, pond edges, outfall areas, and waterway banks.',
  '[Remove invasive flora from bank and wetland areas.](/plants)',
  'Reseed disturbed areas with native flora that can support a healthier riparian edge.',
  'Work with neighbors, community groups, KAB, AWB, and interested parties on routine trash removal.',
  'Consider ADA-accessible infrastructure that gives ADA users better access to the field.',
  'Discuss a potential walking trail around the Tillery wet pond.',
  'Use community outreach to identify other neighborhood-supported amenities and projects.',
];

export const DEFAULT_SITE_CONTENT: SiteContent = {
  mission: 'Restore Tillery Fields by caring for its waterways, rebuilding native habitat, and planning accessible neighborhood amenities with the community.',
  goals: DEFAULT_RESTORATION_GOALS.map(goal => `- ${goal}`).join('\n'),
  about: {
    name: '',
    bio: '',
    imageUrl: '',
    imagePath: '',
  },
};

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Returns the complete content currently presented by the site. Firestore
 * values win when present; missing or blank mission/goals retain the public
 * defaults instead of making the admin editor disagree with the home page.
 */
export function resolveSiteContent(value: unknown): SiteContent {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const about = source.about && typeof source.about === 'object' && !Array.isArray(source.about)
    ? source.about as Record<string, unknown>
    : {};

  return {
    mission: nonEmptyString(source.mission, DEFAULT_SITE_CONTENT.mission),
    goals: nonEmptyString(source.goals, DEFAULT_SITE_CONTENT.goals),
    about: {
      name: stringOrDefault(about.name, DEFAULT_SITE_CONTENT.about.name),
      bio: stringOrDefault(about.bio, DEFAULT_SITE_CONTENT.about.bio),
      imageUrl: stringOrDefault(about.imageUrl, DEFAULT_SITE_CONTENT.about.imageUrl),
      imagePath: stringOrDefault(about.imagePath, DEFAULT_SITE_CONTENT.about.imagePath),
    },
  };
}
