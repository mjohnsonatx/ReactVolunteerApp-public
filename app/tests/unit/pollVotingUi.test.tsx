import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mapAdminPollDocument } from '../../src/services/adminPollMapping';

const h = vi.hoisted(() => ({ vote: vi.fn(), save: vi.fn(), list: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({ currentUser: null, setShowAuthModal: vi.fn(), goToPoll: vi.fn(), events: [], isAdmin: true }) }));
vi.mock('../../src/services/polls', () => ({
  castPollVote: h.vote, savePoll: h.save, fetchAdminPolls: h.list,
  fetchPollResults: vi.fn(), fetchPublicPollVotes: vi.fn(), deletePoll: vi.fn(), setPollStatus: vi.fn(),
}));
import PollCard from '../../src/components/polls/PollCard';
import AdminPolls from '../../src/components/admin/AdminPolls';

function poll(mode: string) {
  return mapAdminPollDocument('p1', {
    question: 'When can you help?', status: 'published', audience: 'anyone', allowVoteChange: true,
    votingMode: mode, maxRankedChoices: mode === 'ranked' ? 2 : null,
    options: [{ id: 'sat', label: 'Saturday' }, { id: 'sun', label: 'Sunday' }, { id: 'mon', label: 'Monday' }],
  });
}
beforeEach(() => { h.list.mockReset().mockResolvedValue([]); h.save.mockReset().mockResolvedValue('new'); h.vote.mockReset(); });

it('submits all selected availability choices in one ballot', async () => {
  const user = userEvent.setup();
  h.vote.mockResolvedValue({ ...poll('multiple'), myVotes: ['sat', 'sun'] });
  render(<PollCard poll={poll('multiple')} />);
  await user.click(screen.getByRole('checkbox', { name: 'Saturday' }));
  await user.click(screen.getByRole('checkbox', { name: 'Sunday' }));
  await user.click(screen.getByRole('button', { name: 'Submit vote' }));
  await waitFor(() => expect(h.vote).toHaveBeenCalledWith('p1', ['sat', 'sun']));
});

it('limits selection to K and allows keyboard-accessible ranking changes', async () => {
  const user = userEvent.setup();
  h.vote.mockResolvedValue({ ...poll('ranked'), myVotes: ['sun', 'sat'] });
  render(<PollCard poll={poll('ranked')} />);
  await user.click(screen.getByRole('checkbox', { name: 'Saturday' }));
  await user.click(screen.getByRole('checkbox', { name: 'Sunday' }));
  expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Move Sunday up' }));
  expect(within(screen.getByRole('list', { name: 'Your ranked choices' })).getAllByRole('listitem')[0]).toHaveTextContent('1.Sunday');
  await user.click(screen.getByRole('button', { name: 'Submit vote' }));
  await waitFor(() => expect(h.vote).toHaveBeenCalledWith('p1', ['sun', 'sat']));
});

it('shows ranked points and explicit ties instead of percentages of respondents', () => {
  render(<PollCard poll={{ ...poll('ranked'), results: { sat: 2, sun: 2, mon: 0 }, totalVotes: 2 }} />);
  const results = screen.getByRole('region', { name: 'Poll results' });
  expect(within(results).getAllByText('2 points')).toHaveLength(2);
  expect(within(results).getAllByText('1. (tie)')).toHaveLength(2);
  expect(results).not.toHaveTextContent('%');
});

it.each(['multiple', 'ranked'])('lets the organizer create a %s poll', async mode => {
  const user = userEvent.setup();
  render(<AdminPolls />);
  await screen.findByText(/No polls yet/);
  await user.click(screen.getByRole('button', { name: 'New Poll' }));
  await user.type(screen.getByLabelText('Question'), 'When can you help?');
  await user.type(screen.getByLabelText('Option 1'), 'Saturday');
  await user.type(screen.getByLabelText('Option 2'), 'Sunday');
  await user.selectOptions(screen.getByLabelText('Voting method'), mode);
  if (mode === 'ranked') expect(screen.getByLabelText('Maximum ranked choices (K)')).toHaveValue(2);
  await user.click(screen.getByRole('button', { name: 'Create poll' }));
  await waitFor(() => expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ votingMode: mode, maxRankedChoices: mode === 'ranked' ? 2 : null })));
});

it('locks the voting setup when editing a poll with responses', async () => {
  h.list.mockResolvedValue([{ ...poll('ranked'), totalVotes: 1 }]);
  render(<AdminPolls />);
  await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Voting method')).toBeDisabled();
  expect(screen.getByLabelText('Maximum ranked choices (K)')).toBeDisabled();
  expect(screen.getByLabelText('Option 1')).toBeDisabled();
});
