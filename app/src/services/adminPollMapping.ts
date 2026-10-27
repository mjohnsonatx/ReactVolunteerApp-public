import {
  pollAudienceOrDefault,
  pollResultAudienceOrDefault,
  pollResultVisibilityOrDefault,
  pollStatusOrDraft,
  pollVotingModeOrDefault,
  type PollVotingMode,
  pollWindowState,
  toMillis,
} from '../utils/sanitize';

export type PollOption = { id: string; label: string; order: number };

export type PollView = {
  id: string;
  question: string;
  description: string;
  notes: string;
  options: PollOption[];
  votingMode: PollVotingMode;
  maxRankedChoices: number | null;
  status: string;
  state: 'draft' | 'upcoming' | 'open' | 'closed' | 'archived';
  audience: string;
  resultVisibility: string;
  resultAudience: string;
  allowVoteChange: boolean;
  showParticipation: boolean;
  privateVotes: boolean;
  opensAt: number | null;
  closesAt: number | null;
  eventId: string;
  createdAt: number | null;
  updatedAt: number | null;
  myVote: string | null;
  myVotes: string[];
  myVoteAt: number | null;
  hasVoted: boolean;
  canSeeResults: boolean;
  results: Record<string, number> | null;
  totalVotes: number | null;
  participantCount: number | null;
};

type AdminPollDocument = Record<string, unknown>;

export function mapAdminPollDocument(id: string, data: AdminPollDocument): PollView {
  const rawOptions = Array.isArray(data.options) ? data.options : [];
  const options = rawOptions.map((value, index) => {
    const option = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
      id: String(option.id || ''),
      label: String(option.label || ''),
      order: Number(option.order ?? index),
    };
  });
  const rawTallies = data.tallies && typeof data.tallies === 'object' && !Array.isArray(data.tallies)
    ? data.tallies as Record<string, unknown>
    : {};
  const tallies = Object.fromEntries(options.map(option => [option.id, Number(rawTallies[option.id] || 0)]));
  const opensAt = toMillis(data.opensAt);
  const closesAt = toMillis(data.closesAt);
  const status = pollStatusOrDraft(data.status);
  const totalVotes = Number(data.totalVotes || 0);

  return {
    id,
    question: String(data.question || ''),
    description: String(data.description || ''),
    notes: String(data.notes || ''),
    options,
    votingMode: pollVotingModeOrDefault(data.votingMode),
    maxRankedChoices: data.votingMode === 'ranked' ? Number(data.maxRankedChoices) : null,
    status,
    state: pollWindowState({ status, opensAt, closesAt }),
    audience: pollAudienceOrDefault(data.audience),
    resultVisibility: pollResultVisibilityOrDefault(data.resultVisibility),
    resultAudience: pollResultAudienceOrDefault(data.resultAudience),
    allowVoteChange: data.allowVoteChange === true,
    showParticipation: data.showParticipation !== false,
    privateVotes: data.privateVotes !== false,
    opensAt,
    closesAt,
    eventId: String(data.eventId || ''),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    myVote: null,
    myVotes: [],
    myVoteAt: null,
    hasVoted: false,
    canSeeResults: true,
    results: tallies,
    totalVotes,
    participantCount: totalVotes,
  };
}
