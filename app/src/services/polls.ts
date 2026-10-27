import {
  callableErrorMessage,
  castPollVoteFn,
  deletePollFn,
  getPollFn,
  getPollResultsFn,
  listPollVotesFn,
  listPublicPollVotesFn,
  listPollsFn,
  savePollFn,
  setPollStatusFn,
} from '../libs/callables';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@runtime/firebase';
import { recordCrash } from '../utils/crashReporting';
import { getParticipantId } from '../utils/participant';
import { validatePoll } from '../utils/sanitize';
import { mapAdminPollDocument, type PollView } from './adminPollMapping';

export type { PollOption, PollView } from './adminPollMapping';

export type PublicPollVote = {
  id: string;
  voterLabel: string;
  optionId: string;
  optionIds: string[];
  createdAt: number | null;
  updatedAt: number | null;
};

export async function fetchPolls(): Promise<PollView[]> {
  try {
    const response = await listPollsFn({ participantId: getParticipantId() });
    return ((response.data as { polls?: PollView[] })?.polls ?? []);
  } catch (err) {
    recordCrash(err, 'polls-list');
    throw new Error(callableErrorMessage(err, 'Could not load polls. Please try again.'));
  }
}

export async function fetchPoll(pollId: string): Promise<PollView> {
  try {
    const response = await getPollFn({ pollId, participantId: getParticipantId() });
    return (response.data as { poll: PollView }).poll;
  } catch (err) {
    recordCrash(err, 'polls-get', { pollId });
    throw new Error(callableErrorMessage(err, 'Could not load this poll.'));
  }
}

// Totals are always fetched from the server, never derived in the browser.
export async function fetchPollResults(pollId: string) {
  try {
    const response = await getPollResultsFn({ pollId, participantId: getParticipantId() });
    return response.data as Pick<PollView, 'myVote' | 'myVotes' | 'votingMode' | 'maxRankedChoices' | 'state'> & {
      results: Record<string, number>;
      totalVotes: number;
    };
  } catch (err) {
    recordCrash(err, 'polls-results', { pollId });
    throw new Error(callableErrorMessage(err, 'Results are not available right now.'));
  }
}

export async function fetchPublicPollVotes(pollId: string): Promise<{ votes: PublicPollVote[]; truncated: boolean }> {
  try {
    const response = await listPublicPollVotesFn({ pollId, participantId: getParticipantId() });
    const data = response.data as { votes?: PublicPollVote[]; truncated?: boolean };
    return { votes: data.votes ?? [], truncated: data.truncated === true };
  } catch (err) {
    recordCrash(err, 'polls-public-votes', { pollId });
    throw new Error(callableErrorMessage(err, 'Public responses are not available right now.'));
  }
}

export async function castPollVote(pollId: string, optionIds: string[]): Promise<PollView> {
  try {
    const response = await castPollVoteFn({ pollId, optionIds, participantId: getParticipantId() });
    return (response.data as { poll: PollView }).poll;
  } catch (err) {
    recordCrash(err, 'polls-vote', { pollId });
    throw new Error(callableErrorMessage(err, 'Could not record your vote. Please try again.'));
  }
}

export async function fetchAdminPolls(): Promise<PollView[]> {
  try {
    // Admin reads are protected by the custom-claim rule. Mutations still go
    // through callable Functions, where validation and audit fields are
    // enforced server-side.
    const snapshot = await getDocs(query(
      collection(db, 'polls'),
      orderBy('createdAt', 'desc'),
      limit(200),
    ));
    return snapshot.docs.map(document => mapAdminPollDocument(document.id, document.data()));
  } catch (err) {
    recordCrash(err, 'polls-admin-list');
    throw new Error(callableErrorMessage(err, 'Could not load polls.'));
  }
}

export async function savePoll(input: Record<string, unknown>): Promise<string> {
  const validation = validatePoll(input);
  if (!validation.ok) throw new Error(validation.reason);
  try {
    const response = await savePollFn(input);
    return (response.data as { id: string }).id;
  } catch (err) {
    recordCrash(err, 'polls-save', { id: input?.id });
    throw new Error(callableErrorMessage(err, 'Could not save the poll. Please try again.'));
  }
}

export async function setPollStatus(pollId: string, status: string) {
  try {
    const response = await setPollStatusFn({ pollId, status });
    return response.data as { status: string };
  } catch (err) {
    recordCrash(err, 'polls-status', { pollId, status });
    throw new Error(callableErrorMessage(err, 'Could not update the poll status.'));
  }
}

export async function deletePoll(pollId: string) {
  try {
    await deletePollFn({ pollId });
  } catch (err) {
    recordCrash(err, 'polls-delete', { pollId });
    throw new Error(callableErrorMessage(err, 'Could not delete the poll.'));
  }
}

export async function fetchPollVotes(pollId: string) {
  try {
    const response = await listPollVotesFn({ pollId });
    return (response.data as { votes: Array<Record<string, unknown>> }).votes ?? [];
  } catch (err) {
    recordCrash(err, 'polls-votes', { pollId });
    throw new Error(callableErrorMessage(err, 'Could not load the vote records.'));
  }
}
