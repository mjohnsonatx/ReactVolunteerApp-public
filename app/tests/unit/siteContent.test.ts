import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_CONTENT, resolveSiteContent } from '../../src/siteContent';

describe('site content defaults', () => {
  it('keeps the mission and all current restoration goals in the shared content record', () => {
    expect(DEFAULT_SITE_CONTENT.mission).toContain('Restore Tillery Fields');
    expect(DEFAULT_SITE_CONTENT.goals).toContain('Clean trash from the stormwater channel');
    expect(DEFAULT_SITE_CONTENT.goals).toContain('Remove invasive flora');
    expect(DEFAULT_SITE_CONTENT.goals).toContain('ADA-accessible infrastructure');
  });

  it('uses saved content while completing a partial About Me record', () => {
    expect(resolveSiteContent({
      mission: 'A saved mission',
      goals: '- A saved goal',
      about: { name: 'River Lead' },
    })).toEqual({
      mission: 'A saved mission',
      goals: '- A saved goal',
      about: { name: 'River Lead', bio: '', imageUrl: '', imagePath: '' },
    });
  });

  it('resolves blank Firestore mission and goals to the content visitors currently see', () => {
    const resolved = resolveSiteContent({ mission: '', goals: '   ', about: null });

    expect(resolved.mission).toBe(DEFAULT_SITE_CONTENT.mission);
    expect(resolved.goals).toBe(DEFAULT_SITE_CONTENT.goals);
    expect(resolved.about).toEqual(DEFAULT_SITE_CONTENT.about);
  });
});
