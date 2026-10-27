import { pollVotingModeOrDefault } from '../shared';

// Only the server assigns points. A partial ranked ballot uses the poll's fixed
// K, so omitting a lower preference never changes the value of a higher one.
export function ballotPoints(poll: { votingMode?: unknown; maxRankedChoices?: unknown }, optionIds: string[]): Record<string, number> {
  const ranked = pollVotingModeOrDefault(poll.votingMode) === 'ranked';
  return Object.fromEntries(optionIds.map((id, index) => [id, ranked ? Number(poll.maxRankedChoices) - index : 1]));
}
