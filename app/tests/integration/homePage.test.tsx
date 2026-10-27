import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Activity cards have their own integration coverage, including data loading and actions.
vi.mock('../../src/components/user/HomeActivity', () => ({ default: () => <section aria-label="Home activity" /> }));

const mocks = vi.hoisted(() => ({
  state: {
    siteContent: {
      mission: '',
      goals: '',
      about: { name: '', bio: '', imageUrl: '', imagePath: '' },
    },
    overlayGroups: [],
    publishedOverlayGroups: [],
    effectiveVisibleIds: [],
    submitted: false,
    signupError: '',
    mailSubmitted: false,
    mailError: '',
  },
  handleSignup: vi.fn(),
  handleMailingList: vi.fn(),
  setSignupError: vi.fn(),
  setMailError: vi.fn(),
  setPage: vi.fn(),
  toggleOverlayGroup: vi.fn(),
  mapProps: [] as any[],
}));

vi.mock('../../src/context/AppContext', async () => {
  const React = await import('react');
  return {
    useApp: () => {
      const [form, setForm] = React.useState({ name: '', email: '', phone: '' });
      const [mailForm, setMailForm] = React.useState('');
      const [openFaq, setOpenFaq] = React.useState(null);
      const [effectiveVisibleIds, setEffectiveVisibleIds] = React.useState(mocks.state.effectiveVisibleIds);

      return {
        siteContent: mocks.state.siteContent,
        overlayGroups: mocks.state.overlayGroups,
        publishedOverlayGroups: mocks.state.publishedOverlayGroups,
        effectiveVisibleIds,
        toggleOverlayGroup: (id) => {
          mocks.toggleOverlayGroup(id);
          setEffectiveVisibleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        },
        submitted: mocks.state.submitted,
        signupError: mocks.state.signupError,
        form,
        setForm,
        setSignupError: mocks.setSignupError,
        handleSignup: (event) => {
          event.preventDefault();
          mocks.handleSignup({ ...form });
        },
        mailSubmitted: mocks.state.mailSubmitted,
        mailForm,
        setMailForm,
        mailError: mocks.state.mailError,
        setMailError: mocks.setMailError,
        handleMailingList: (event) => {
          event.preventDefault();
          mocks.handleMailingList(mailForm);
        },
        openFaq,
        setOpenFaq,
        setPage: mocks.setPage,
      };
    },
  };
});

vi.mock('../../src/components/Map', () => ({
  default: (props) => {
    mocks.mapProps.push(props);
    return <div data-testid="map-view" data-visible-groups={props.visibleGroupIds.join(',')} />;
  },
}));

vi.mock('lucide-react', async () => {
  const React = await import('react');
  const Icon = React.forwardRef((props, ref) => React.createElement('svg', { ...props, ref }));
  const icons = [
    'Check', 'ChevronDown', 'Droplets', 'HelpCircle', 'Leaf', 'Mail', 'MapPin', 'Target', 'Users',
  ];
  return Object.fromEntries([['__esModule', true], ...icons.map(name => [name, Icon])]);
});

import HomePage from '../../src/components/user/pages/HomePage';

beforeEach(() => {
  mocks.state.siteContent = {
    mission: '',
    goals: '',
    about: { name: '', bio: '', imageUrl: '', imagePath: '' },
  };
  mocks.state.overlayGroups = [];
  mocks.state.publishedOverlayGroups = [];
  mocks.state.effectiveVisibleIds = [];
  mocks.state.submitted = false;
  mocks.state.signupError = '';
  mocks.state.mailSubmitted = false;
  mocks.state.mailError = '';
  mocks.handleSignup.mockClear();
  mocks.handleMailingList.mockClear();
  mocks.setSignupError.mockClear();
  mocks.setMailError.mockClear();
  mocks.setPage.mockClear();
  mocks.toggleOverlayGroup.mockClear();
  mocks.mapProps = [];
});

describe('HomePage landing content', () => {
  it('renders the full public landing page with safe fallback content', async () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: /creek & watershed clean-up/i })).toBeInTheDocument();
    expect(screen.getByText(/restore tillery fields/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /service area/i })).toBeInTheDocument();
    expect(await screen.findByTestId('map-view')).toHaveAttribute('data-visible-groups', '');
    expect(screen.getByText(/restoration plan priorities/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /remove invasive flora/i })).toHaveAttribute('href', '/plants');
    expect(screen.getByRole('heading', { name: /volunteer/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /newsletter/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /faq/i })).toBeInTheDocument();
  });

  it('puts the mission before live activity and combines both signup forms in one section', () => {
    render(<HomePage />);
    const mission = screen.getByRole('region', { name: 'Our Mission' });
    const activity = screen.getByRole('region', { name: 'Home activity' });
    const join = screen.getByRole('region', { name: 'Join the effort' });
    const goals = screen.getByRole('region', { name: 'Our Goals' });
    const area = screen.getByRole('region', { name: 'Service Area' });

    expect(mission.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(activity.compareDocumentPosition(area) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(area.compareDocumentPosition(goals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(goals.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(join.querySelectorAll('form')).toHaveLength(2);
    expect(within(join).getByRole('heading', { name: 'Volunteer' })).toBeInTheDocument();
    expect(within(join).getByRole('heading', { name: 'Newsletter' })).toBeInTheDocument();
  });

  it('renders CMS-supplied mission and goals as the current editable content', () => {
    mocks.state.siteContent = {
      mission: '## Community Mission\n\nKeep **waterways** clean with [neighbors](https://example.test).',
      goals: '- Host monthly cleanups\n- Share accessible maps',
      about: { name: '', bio: '', imageUrl: '', imagePath: '' },
    };

    const { container } = render(<HomePage />);

    expect(screen.getByRole('heading', { name: /community mission/i })).toBeInTheDocument();
    expect(screen.getByText('waterways')).toBeInTheDocument();
    expect(screen.queryByText(/restore tillery fields/i)).not.toBeInTheDocument();
    expect(screen.getByText(/host monthly cleanups/i)).toBeInTheDocument();
    expect(screen.getByText(/restoration plan priorities/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /remove invasive flora/i })).not.toBeInTheDocument();

    const link = container.querySelector('a[href="https://example.test"]');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('only shows published overlay groups and wires the legend toggle back to the page state', async () => {
    mocks.state.overlayGroups = [
      { id: 'public-boundary', name: 'Public creek boundary', color: '#047857', published: true, geojson: { features: [] } },
      { id: 'draft-boundary', name: 'Draft staging area', color: '#dc2626', published: false, geojson: { features: [] } },
    ];
    mocks.state.publishedOverlayGroups = [mocks.state.overlayGroups[0]];
    mocks.state.effectiveVisibleIds = ['public-boundary'];

    render(<HomePage />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: /public creek boundary/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /draft staging area/i })).not.toBeInTheDocument();
    expect(await screen.findByTestId('map-view')).toHaveAttribute('data-visible-groups', 'public-boundary');

    await user.click(screen.getByRole('button', { name: /public creek boundary/i }));

    expect(mocks.toggleOverlayGroup).toHaveBeenCalledWith('public-boundary');
    await waitFor(() => expect(screen.getByTestId('map-view')).toHaveAttribute('data-visible-groups', ''));
  });

  it('opens and closes FAQ answers without disturbing the rest of the page', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    expect(screen.queryByText(/check email morning-of/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /what if it rains/i }));
    expect(screen.getByText(/check email morning-of/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /what if it rains/i }));
    expect(screen.queryByText(/check email morning-of/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /volunteer/i })).toBeInTheDocument();
  });
});

describe('HomePage public forms', () => {
  it('submits volunteer signup values through the landing form', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Name'), 'Jane Walker');
    await user.type(screen.getAllByPlaceholderText('Email')[0], 'jane@example.com');
    await user.type(screen.getByPlaceholderText(/phone/i), '512-555-0110');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(mocks.setSignupError).toHaveBeenCalledWith('');
    await waitFor(() => expect(mocks.handleSignup).toHaveBeenCalledWith({
      name: 'Jane Walker',
      email: 'jane@example.com',
      phone: '512-555-0110',
    }));
  });

  it('submits newsletter signup values through the landing form', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.type(screen.getAllByPlaceholderText('Email')[1], 'updates@example.com');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    expect(mocks.setMailError).toHaveBeenCalledWith('');
    await waitFor(() => expect(mocks.handleMailingList).toHaveBeenCalledWith('updates@example.com'));
  });

  it('surfaces provider success and error states on the landing page', () => {
    mocks.state.signupError = 'Please enter a valid email address.';
    mocks.state.mailError = 'Something went wrong. Please try again.';
    const { rerender } = render(<HomePage />);

    expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    mocks.state.submitted = true;
    mocks.state.mailSubmitted = true;
    mocks.state.signupError = '';
    mocks.state.mailError = '';
    rerender(<HomePage />);

    expect(screen.getByText(/thanks for signing up/i)).toBeInTheDocument();
    expect(screen.getByText(/subscribed/i)).toBeInTheDocument();
  });
});
