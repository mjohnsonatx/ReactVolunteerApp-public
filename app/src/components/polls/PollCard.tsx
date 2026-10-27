import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, CheckCircle2, Clock, Eye, Loader2, Lock } from 'lucide-react';
import { pollVoteOptionIds, pollVotingModeOrDefault } from '../../utils/sanitize';
import PollResults from './PollResults';
import { useApp } from '../../context/AppContext';
import {
  castPollVote,
  fetchPollResults,
  fetchPublicPollVotes,
  type PollView,
  type PublicPollVote,
} from '../../services/polls';

function stateBadge(state: PollView['state']) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: 'Open for voting', className: 'bg-emerald-50 text-emerald-700' },
    upcoming: { label: 'Opens soon', className: 'bg-amber-50 text-amber-700' },
    closed: { label: 'Closed', className: 'bg-gray-100 text-gray-600' },
    archived: { label: 'Archived', className: 'bg-gray-100 text-gray-500' },
    draft: { label: 'Draft', className: 'bg-gray-100 text-gray-500' },
  };
  return map[state] || map.draft;
}

function formatDate(value: number | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

type PollCardProps = {
  poll: PollView;
  onChange?: (poll: PollView) => void;
  showLink?: boolean;
};

export default function PollCard({ poll, onChange, showLink = true }: PollCardProps) {
  const { currentUser, setShowAuthModal, goToPoll } = useApp();
  const [selected, setSelected] = useState<string[]>(poll.myVotes ?? (poll.myVote ? [poll.myVote] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [results, setResults] = useState(poll.results);
  const [totalVotes, setTotalVotes] = useState(poll.totalVotes);
  const [resultsError, setResultsError] = useState('');
  const [loadingResults, setLoadingResults] = useState(false);
  const [publicVotes, setPublicVotes] = useState<PublicPollVote[] | null>(null);
  const [publicVotesError, setPublicVotesError] = useState('');
  const [loadingPublicVotes, setLoadingPublicVotes] = useState(false);
  useEffect(() => {
    setSelected(poll.myVotes ?? (poll.myVote ? [poll.myVote] : []));
    setResults(poll.results);
    setTotalVotes(poll.totalVotes);
    setPublicVotes(null);
  }, [poll]);

  const mode = pollVotingModeOrDefault(poll.votingMode);
  const ranked = mode === 'ranked';
  const maxChoices = ranked ? Number(poll.maxRankedChoices) : poll.options.length;

  const badge = stateBadge(poll.state);
  const membersOnly = poll.audience === 'members';
  const guestsOnly = poll.audience === 'guests';
  const needsSignIn = membersOnly && !currentUser;
  const needsVerification = currentUser?.emailVerified === false;
  const blockedGuestOnly = guestsOnly && !!currentUser;
  const canVote = poll.state === 'open' && !needsSignIn && !needsVerification && !blockedGuestOnly
    && (!poll.hasVoted || poll.allowVoteChange);
  const groupName = `poll-${poll.id}`;

  const submitVote = async (event) => {
    event.preventDefault();
    if (needsSignIn) { setShowAuthModal(true); return; }
    if (!selected.length) { setError('Please choose at least one option first.'); return; }
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const updated = await castPollVote(poll.id, selected);
      setResults(updated.results);
      setTotalVotes(updated.totalVotes);
      setSelected(updated.myVotes);
      setPublicVotes(null);
      setStatus(poll.hasVoted ? 'Your vote was updated.' : 'Thanks - your vote was recorded.');
      if (onChange) onChange(updated);
    } catch (err) {
      setError(err?.message || 'Could not record your vote.');
    } finally {
      setBusy(false);
    }
  };

  const loadResults = async () => {
    setResultsError('');
    setLoadingResults(true);
    try {
      const data = await fetchPollResults(poll.id);
      setResults(data.results);
      setTotalVotes(data.totalVotes);
    } catch (err) {
      setResultsError(err?.message || 'Results are not available right now.');
    } finally {
      setLoadingResults(false);
    }
  };

  const loadPublicVotes = async () => {
    setPublicVotesError('');
    setLoadingPublicVotes(true);
    try {
      const data = await fetchPublicPollVotes(poll.id);
      setPublicVotes(data.votes);
    } catch (err) {
      setPublicVotesError(err?.message || 'Public responses are not available right now.');
    } finally {
      setLoadingPublicVotes(false);
    }
  };

  const toggleOption = (id: string) => {
    setError('');
    setSelected(previous => mode === 'single' ? [id]
      : previous.includes(id) ? previous.filter(value => value !== id)
        : previous.length < maxChoices ? [...previous, id] : previous);
  };
  const moveOption = (index: number, direction: number) => {
    setSelected(previous => {
      const next = [...previous];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  };

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
        {poll.hasVoted && (
          <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-700">
            <CheckCircle2 size={12} aria-hidden="true" /> You voted
          </span>
        )}
        {membersOnly && (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            <Lock size={12} aria-hidden="true" /> Members only
          </span>
        )}
        {!membersOnly && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Informal survey</span>
        )}
        {!poll.privateVotes && (
          <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
            <Eye size={12} aria-hidden="true" /> Responses are public
          </span>
        )}
        {poll.showParticipation && poll.participantCount !== null && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {poll.participantCount} {poll.participantCount === 1 ? 'response' : 'responses'}
          </span>
        )}
      </div>

      <h3 className="text-lg font-semibold text-gray-800">
        {showLink
          ? <button type="button" onClick={() => goToPoll(poll.id)} className="text-left hover:text-teal-700 hover:underline">{poll.question}</button>
          : poll.question}
      </h3>
      {poll.description && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{poll.description}</p>}
      {!membersOnly && <p className="mt-1 text-xs text-gray-500">Guest votes identify a browser, not a person. Results should not be used for binding decisions.</p>}
      {poll.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-400">{poll.notes}</p>}

      {(poll.opensAt || poll.closesAt) && (
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {poll.opensAt && <span className="flex items-center gap-1"><Clock size={12} aria-hidden="true" />Opens {formatDate(poll.opensAt)}</span>}
          {poll.closesAt && <span className="flex items-center gap-1"><Clock size={12} aria-hidden="true" />Closes {formatDate(poll.closesAt)}</span>}
        </p>
      )}

      <form onSubmit={submitVote} className="mt-4 space-y-3">
        <p id={`${groupName}-instructions`} className="text-sm font-medium text-teal-800">
          {mode === 'single' && 'Choose one option.'}
          {mode === 'multiple' && 'Select all options that work for you.'}
          {ranked && `Choose up to ${maxChoices} options, then put your favorite first.`}
        </p>
        {ranked && <p className="text-xs text-gray-500">First choice earns {maxChoices} points, each next choice earns one fewer. Unranked choices earn zero.</p>}
        <fieldset disabled={!canVote || busy} className="space-y-2">
          <legend className="sr-only">{poll.question}</legend>
          {poll.options.map((option) => (
              <div key={option.id} className="rounded-lg border border-gray-100 px-3 py-2">
                <label className="flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type={mode === 'single' ? 'radio' : 'checkbox'}
                    name={groupName}
                    value={option.id}
                    checked={selected.includes(option.id)}
                    disabled={ranked && selected.length >= maxChoices && !selected.includes(option.id)}
                    aria-describedby={`${groupName}-instructions`}
                    onChange={() => toggleOption(option.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 break-words">{option.label}</span>
                </label>
              </div>
          ))}
          {ranked && selected.length > 0 && (
            <div className="rounded-xl bg-teal-50 p-3">
              <p className="mb-2 text-sm font-semibold text-teal-900">Your ranking ({selected.length} of {maxChoices})</p>
              <ol aria-label="Your ranked choices" className="space-y-2">
                {selected.map((id, index) => {
                  const label = poll.options.find(option => option.id === id)?.label || id;
                  return <li key={id} className="flex items-center gap-2 rounded-lg bg-white p-2 text-sm">
                    <span className="font-semibold text-teal-800">{index + 1}.</span>
                    <span className="min-w-0 flex-1 break-words">{label}</span>
                    <button type="button" onClick={() => moveOption(index, -1)} disabled={index === 0} aria-label={`Move ${label} up`} className="rounded border border-teal-200 p-2 disabled:opacity-30"><ArrowUp size={16} aria-hidden="true" /></button>
                    <button type="button" onClick={() => moveOption(index, 1)} disabled={index === selected.length - 1} aria-label={`Move ${label} down`} className="rounded border border-teal-200 p-2 disabled:opacity-30"><ArrowDown size={16} aria-hidden="true" /></button>
                  </li>;
                })}
              </ol>
            </div>
          )}
        </fieldset>

        <p className="sr-only" role="status" aria-live="polite">{status}</p>
        {status && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {poll.state === 'upcoming' && (
          <p className="text-sm text-amber-700">This poll has not opened yet. Check back on {formatDate(poll.opensAt)}.</p>
        )}
        {poll.state === 'closed' && <p className="text-sm text-gray-500">Voting has closed for this poll.</p>}
        {needsSignIn && (
          <button type="button" onClick={() => setShowAuthModal(true)} className="w-full rounded-lg border-2 border-dashed border-gray-200 py-2 text-sm text-gray-500 hover:border-teal-300">
            Sign in to vote in this poll
          </button>
        )}
        {blockedGuestOnly && <p className="text-sm text-gray-500">This poll is for neighbors without an account.</p>}
        {needsVerification && <p className="text-sm text-amber-700">Verify your email address before voting.</p>}
        {!poll.privateVotes && (
          <p className="text-xs text-blue-700">
            {currentUser
              ? 'Your username and selected choices will be visible with the public responses.'
              : 'Your selected choices will be public, but guest identifiers are not displayed.'}
          </p>
        )}
        {poll.hasVoted && !poll.allowVoteChange && (
          <p className="text-sm text-gray-500">You already voted. Answers cannot be changed for this poll.</p>
        )}

        {canVote && (
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {poll.hasVoted ? 'Update my vote' : 'Submit vote'}
          </button>
        )}
      </form>

      <PollResults {...poll} votingMode={mode} results={results} totalVotes={totalVotes} />

      {!results && poll.canSeeResults && (
        <button
          type="button"
          onClick={loadResults}
          disabled={loadingResults}
          className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
        >
          <BarChart3 size={14} aria-hidden="true" />{loadingResults ? 'Loading results...' : 'Show results'}
        </button>
      )}
      {!poll.canSeeResults && (
        <p className="mt-3 text-xs text-gray-400">
          {poll.resultVisibility === 'afterVote' && 'Results appear after you vote.'}
          {poll.resultVisibility === 'afterClose' && 'Results are published when the poll closes.'}
          {poll.resultVisibility === 'adminOnly' && 'Results are reviewed by the organizers.'}
          {poll.resultVisibility === 'beforeVote' && poll.resultAudience === 'members' && 'Sign in to see the results.'}
        </p>
      )}
      {resultsError && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{resultsError}</p>}

      {!poll.privateVotes && poll.canSeeResults && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          {publicVotes === null ? (
            <button
              type="button"
              onClick={loadPublicVotes}
              disabled={loadingPublicVotes}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <Eye size={14} aria-hidden="true" />
              {loadingPublicVotes ? 'Loading public responses...' : 'Show public responses'}
            </button>
          ) : publicVotes.length === 0 ? (
            <p className="text-xs text-gray-400">No public responses yet.</p>
          ) : (
            <ul className="space-y-1 text-sm" aria-label="Public poll responses">
              {publicVotes.map(vote => (
                <li key={vote.id} className="flex justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <span className="font-medium text-gray-700">{vote.voterLabel}</span>
                  <span className="text-gray-500">
                    {pollVoteOptionIds(vote).map((id, index) => {
                      const label = poll.options.find(option => option.id === id)?.label || 'Unknown option';
                      return ranked ? `${index + 1}. ${label}` : label;
                    }).join(ranked ? ' → ' : ', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {publicVotesError && <p role="alert" className="mt-2 text-sm text-red-600">{publicVotesError}</p>}
        </div>
      )}
    </article>
  );
}
