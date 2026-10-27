import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PollView } from '../../src/services/adminPollMapping';

const mocks = vi.hoisted(() => ({
  fetchPolls: vi.fn(), castPollVote: vi.fn(),
  ctx: {
    events: [] as any[], currentUser: null as any, isRsvped: vi.fn(() => false),
    toggleRsvp: vi.fn(), setSelectedEventMap: vi.fn(), goToEvent: vi.fn(),
    goToPoll: vi.fn(), setShowAuthModal: vi.fn(), navigate: vi.fn(),
  },
}));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => mocks.ctx }));
vi.mock('../../src/services/polls', () => ({
  fetchPolls: mocks.fetchPolls, castPollVote: mocks.castPollVote,
  fetchPollResults: vi.fn(), fetchPublicPollVotes: vi.fn(),
}));
vi.mock('../../src/components/events/EventComments', () => ({ default: () => null }));
vi.mock('../../src/components/events/EventImageGallery', () => ({ default: () => null }));
vi.mock('../../src/components/shared/StorageImage', () => ({ default: () => null }));

import HomeActivity from '../../src/components/user/HomeActivity';

function poll(overrides: Partial<PollView> = {}): PollView {
  return {
    id: 'poll-1', question: 'Where should we plant trees?', description: '', notes: '',
    options: [{ id: 'pond', label: 'By the pond', order: 0 }, { id: 'trail', label: 'Along the trail', order: 1 }],
    votingMode: 'single', maxRankedChoices: null, myVotes: [],
    status: 'published', state: 'open', audience: 'anyone', resultVisibility: 'afterVote', resultAudience: 'public',
    allowVoteChange: false, showParticipation: true, privateVotes: true,
    opensAt: null, closesAt: null, eventId: '', createdAt: null, updatedAt: null,
    myVote: null, myVoteAt: null, hasVoted: false, canSeeResults: false,
    results: null, totalVotes: null, participantCount: null, ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-14T18:00:00Z').getTime());
  mocks.ctx.events = [];
  mocks.ctx.currentUser = null;
  mocks.fetchPolls.mockReset().mockResolvedValue([]);
  mocks.castPollVote.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('home activity cards', () => {
  it('shows upcoming events in date order and supports RSVP without leaving home', async () => {
    mocks.ctx.events = [
      { id: 'later', title: 'Native planting', date: '2026-09-20', time: '10 AM', location: 'Pond' },
      { id: 'past', title: 'Old cleanup', date: '2026-09-13' },
      { id: 'today', title: 'Creek cleanup', date: '2026-09-14', time: '9 AM', location: 'Tillery Fields' },
    ];
    render(<HomeActivity />);
    const events = screen.getByRole('region', { name: 'Upcoming events' });
    expect(within(events).getAllByRole('heading', { level: 3 }).map(item => item.textContent))
      .toEqual(['Creek cleanup', 'Native planting']);
    expect(screen.queryByText('Old cleanup')).not.toBeInTheDocument();
    await userEvent.click(within(events).getAllByRole('button', { name: 'RSVP' })[0]);
    expect(mocks.ctx.toggleRsvp).toHaveBeenCalledWith('today');
    expect(mocks.ctx.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'All events' })).toHaveAttribute('href', '/events');
    await screen.findByText(/no polls are open/i);
  });

  it('lets visitors vote inline and immediately reflects their recorded vote', async () => {
    mocks.fetchPolls.mockResolvedValue([poll(), poll({ id: 'old', question: 'Closed question', state: 'closed' })]);
    mocks.castPollVote.mockResolvedValue(poll({ hasVoted: true, myVote: 'pond', myVotes: ['pond'], canSeeResults: true, results: { pond: 1, trail: 0 }, totalVotes: 1 }));
    render(<HomeActivity />);
    expect(screen.getByText('Loading current polls...')).toBeInTheDocument();
    const choice = await screen.findByRole('radio', { name: 'By the pond' });
    expect(screen.queryByText('Closed question')).not.toBeInTheDocument();
    await userEvent.click(choice);
    await userEvent.click(screen.getByRole('button', { name: 'Submit vote' }));
    await waitFor(() => expect(mocks.castPollVote).toHaveBeenCalledWith('poll-1', ['pond']));
    expect(await screen.findByText('You voted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit vote' })).not.toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'By the pond: 1 responses' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All polls' })).toHaveAttribute('href', '/polls');
  });

  it('preserves the member-only voting requirement', async () => {
    mocks.fetchPolls.mockResolvedValue([poll({ audience: 'members' })]);
    render(<HomeActivity />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in to vote in this poll' }));
    expect(mocks.ctx.setShowAuthModal).toHaveBeenCalledWith(true);
    expect(mocks.castPollVote).not.toHaveBeenCalled();
  });

  it('offers a retry when polls fail without hiding events or misreporting an empty list', async () => {
    mocks.fetchPolls.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([poll()]);
    mocks.ctx.events = [{ id: 'event', title: 'Creek cleanup', date: '2026-09-15' }];
    render(<HomeActivity />);
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load the current polls.');
    expect(screen.queryByText(/no polls are open/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Creek cleanup' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('radio', { name: 'By the pond' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows useful empty states when there is no current activity', async () => {
    render(<HomeActivity />);
    expect(screen.getByText(/no upcoming events are scheduled/i)).toBeInTheDocument();
    expect(await screen.findByText(/no polls are open right now/i)).toBeInTheDocument();
  });

  it('reloads personalized polls on sign-in and ignores an older guest response', async () => {
    let resolveGuest: (value: PollView[]) => void;
    mocks.fetchPolls.mockReturnValueOnce(new Promise<PollView[]>(resolve => { resolveGuest = resolve; }))
      .mockResolvedValueOnce([poll({ hasVoted: true, myVote: 'pond' })]);
    const { rerender } = render(<HomeActivity />);
    mocks.ctx.currentUser = { id: 'member-1' };
    rerender(<HomeActivity />);
    expect(await screen.findByText('You voted')).toBeInTheDocument();
    await act(async () => resolveGuest!([poll()]));
    expect(screen.getByText('You voted')).toBeInTheDocument();
    expect(mocks.fetchPolls).toHaveBeenCalledTimes(2);
  });
});
