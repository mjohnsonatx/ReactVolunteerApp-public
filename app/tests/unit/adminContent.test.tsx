import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_SITE_CONTENT } from '../../src/siteContent';

const h = vi.hoisted(() => ({
  ctx: {
    siteContent: { mission: '', goals: '', about: { name: '', bio: '', imageUrl: '', imagePath: '' } },
    isAdmin: true,
    runBackendTask: (_message: string, task: () => unknown) => task(),
  } as any,
}));

vi.mock('@runtime/app-context', () => ({ useApp: () => h.ctx }));
vi.mock('../../src/libs/callables', () => ({ saveSiteContentFn: vi.fn() }));

import AdminContent from '../../src/components/admin/AdminContent';

beforeEach(() => {
  h.ctx = {
    siteContent: { mission: '', goals: '', about: { name: '', bio: '', imageUrl: '', imagePath: '' } },
    isAdmin: true,
    runBackendTask: (_message: string, task: () => unknown) => task(),
  };
});

function editorForHeading(name: string): HTMLTextAreaElement {
  const heading = screen.getByRole('heading', { name });
  return within(heading.parentElement as HTMLElement).getByRole('textbox') as HTMLTextAreaElement;
}

describe('AdminContent', () => {
  it('loads the current public defaults into every applicable edit control', () => {
    render(<AdminContent />);

    expect(editorForHeading('Our Mission')).toHaveValue(DEFAULT_SITE_CONTENT.mission);
    expect(editorForHeading('Our Goals')).toHaveValue(DEFAULT_SITE_CONTENT.goals);
    expect(screen.getByPlaceholderText('Your name')).toHaveValue('');
    expect(screen.getByText('Introduction').parentElement?.querySelector('textarea')).toHaveValue('');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('refreshes every edit control when saved Firestore content arrives', async () => {
    const view = render(<AdminContent />);

    h.ctx = {
      ...h.ctx,
      siteContent: {
        mission: 'Saved mission',
        goals: '- Saved goal',
        about: {
          name: 'River Lead',
          bio: 'Creek cleanup organizer',
          imageUrl: 'https://example.test/profile.jpg',
          imagePath: 'siteContent/profile.jpg',
        },
      },
    };
    view.rerender(<AdminContent />);

    await waitFor(() => expect(editorForHeading('Our Mission')).toHaveValue('Saved mission'));
    expect(editorForHeading('Our Goals')).toHaveValue('- Saved goal');
    expect(screen.getByPlaceholderText('Your name')).toHaveValue('River Lead');
    expect(screen.getByText('Introduction').parentElement?.querySelector('textarea'))
      .toHaveValue('Creek cleanup organizer');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
