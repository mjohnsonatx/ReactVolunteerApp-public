// components/admin/AdminPolls.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { useApp } from '@runtime/app-context';
import {
  POLL_AUDIENCES,
  POLL_AUDIENCE_LABELS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_VOTING_MODES,
  POLL_VOTING_MODE_LABELS,
  POLL_RESULT_AUDIENCES,
  POLL_RESULT_AUDIENCE_LABELS,
  POLL_RESULT_VISIBILITIES,
  POLL_RESULT_VISIBILITY_LABELS,
  LIMITS,
} from '../../utils/sanitize';
import {
  deletePoll,
  fetchAdminPolls,
  savePoll,
  setPollStatus,
  type PollView,
} from '../../services/polls';
import PollResults from '../polls/PollResults';

const emptyDraft = {
  id: '',
  question: '',
  description: '',
  notes: '',
  options: ['', ''],
  votingMode: 'single',
  maxRankedChoices: 2,
  audience: 'members',
  resultVisibility: 'afterVote',
  resultAudience: 'public',
  allowVoteChange: false,
  showParticipation: true,
  privateVotes: true,
  opensAt: '',
  closesAt: '',
  eventId: '',
};

function toLocalInput(value: number | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function statusLabel(poll: PollView): string {
  if (poll.status === 'published' && poll.state === 'upcoming') return 'published (opens later)';
  if (poll.status === 'published' && poll.state === 'closed') return 'published (window closed)';
  return poll.status;
}

export default function AdminPolls() {
  const { events, isAdmin } = useApp();
  const [polls, setPolls] = useState<PollView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPolls(await fetchAdminPolls());
    } catch (err) {
      setError(err?.message || 'Could not load polls.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const optionCount = draft.options.length;
  const canAddOption = optionCount < POLL_MAX_OPTIONS;
  const canRemoveOption = optionCount > POLL_MIN_OPTIONS;

  const eventOptions = useMemo(
    () => events.map(event => ({ id: event.id, title: event.title })),
    [events],
  );

  const startNew = () => {
    setDraft({ ...emptyDraft, options: ['', ''] });
    setFormOpen(true);
    setNotice('');
    setError('');
  };

  const startEdit = (poll: PollView) => {
    setDraft({
      id: poll.id,
      question: poll.question,
      description: poll.description,
      notes: poll.notes,
      options: poll.options.map(option => option.label),
      optionIds: poll.options.map(option => option.id),
      votingMode: poll.votingMode,
      maxRankedChoices: poll.maxRankedChoices ?? Math.min(3, poll.options.length),
      hasVotes: Number(poll.totalVotes || 0) > 0,
      audience: poll.audience,
      resultVisibility: poll.resultVisibility,
      resultAudience: poll.resultAudience,
      allowVoteChange: poll.allowVoteChange,
      showParticipation: poll.showParticipation,
      privateVotes: poll.privateVotes,
      opensAt: toLocalInput(poll.opensAt),
      closesAt: toLocalInput(poll.closesAt),
      eventId: poll.eventId || '',
    });
    setFormOpen(true);
    setNotice('');
    setError('');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        ...(draft.id ? { id: draft.id } : {}),
        question: draft.question,
        description: draft.description,
        notes: draft.notes,
        options: draft.options
          .map((label: string, index: number) => ({ label, id: draft.optionIds?.[index] }))
          .filter((option: { label: string }) => option.label.trim()),
        audience: draft.audience,
        votingMode: draft.votingMode,
        maxRankedChoices: draft.votingMode === 'ranked' ? Number(draft.maxRankedChoices) : null,
        resultVisibility: draft.resultVisibility,
        resultAudience: draft.resultAudience,
        allowVoteChange: draft.allowVoteChange,
        showParticipation: draft.showParticipation,
        privateVotes: draft.privateVotes,
        opensAt: draft.opensAt || null,
        closesAt: draft.closesAt || null,
        eventId: draft.eventId || '',
      };
      await savePoll(payload);
      setNotice(draft.id ? 'Poll saved.' : 'Poll created as a draft.');
      setFormOpen(false);
      setDraft(emptyDraft);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not save the poll.');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (poll: PollView, status: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await setPollStatus(poll.id, status);
      setNotice(`"${poll.question}" is now ${status}.`);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not update the poll.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (poll: PollView) => {
    setBusy(true);
    setError('');
    try {
      await deletePoll(poll.id);
      setNotice('Poll deleted.');
      await load();
    } catch (err) {
      setError(err?.message || 'Could not delete the poll.');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-teal-600" aria-hidden="true" />
            <h2 className="text-xl font-bold text-gray-800">Polls ({polls.length})</h2>
          </div>
          <button
            type="button"
            onClick={startNew}
            className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm text-white hover:bg-teal-600"
          >
            <Plus size={18} aria-hidden="true" />New Poll
          </button>
        </div>

        <div className="px-6 pt-4">
          <p className="sr-only" role="status" aria-live="polite">{notice || error}</p>
          {notice && <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="space-y-3 p-6">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-gray-500" role="status">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading polls...
            </p>
          )}
          {!loading && polls.length === 0 && (
            <p className="py-8 text-center text-gray-400">No polls yet. Create one to ask the neighborhood a question.</p>
          )}
          {polls.map(poll => (
            <div key={poll.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-800">{poll.question}</h3>
                  <p className="text-xs text-gray-500">
                    {statusLabel(poll)} - {POLL_VOTING_MODE_LABELS[poll.votingMode]} - {poll.options.length} options - {poll.totalVotes ?? 0} responses
                    {poll.eventId ? ' - linked to an event' : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    {POLL_AUDIENCE_LABELS[poll.audience]} - results: {POLL_RESULT_VISIBILITY_LABELS[poll.resultVisibility]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(poll)} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">Edit</button>
                  {poll.status !== 'published' && (
                    <button type="button" onClick={() => changeStatus(poll, 'published')} disabled={busy} className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs text-white hover:bg-teal-600 disabled:opacity-50">Publish</button>
                  )}
                  {poll.status === 'published' && (
                    <button type="button" onClick={() => changeStatus(poll, 'closed')} disabled={busy} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-white hover:bg-amber-600 disabled:opacity-50">Close</button>
                  )}
                  {poll.status !== 'draft' && (
                    <button type="button" onClick={() => changeStatus(poll, 'draft')} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">Back to draft</button>
                  )}
                  {poll.status !== 'archived' && (
                    <button type="button" onClick={() => changeStatus(poll, 'archived')} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50">Archive</button>
                  )}
                  <button type="button" onClick={() => handleDelete(poll)} disabled={busy} aria-label={`Delete ${poll.question}`} className="rounded-lg border border-red-100 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <PollResults {...poll} />
            </div>
          ))}
        </div>
      </div>

      {formOpen && (
        <form onSubmit={handleSave} className="space-y-4 rounded-2xl bg-white p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">{draft.id ? 'Edit poll' : 'New poll'}</h3>
            <button type="button" onClick={() => setFormOpen(false)} aria-label="Close poll form" className="text-gray-400 hover:text-gray-600">
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Question
            <input
              required
              type="text"
              maxLength={LIMITS.pollQuestion}
              value={draft.question}
              onChange={event => setDraft({ ...draft, question: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-teal-500"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Description (optional)
            <textarea
              rows={2}
              maxLength={LIMITS.pollDescription}
              value={draft.description}
              onChange={event => setDraft({ ...draft, description: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-teal-500"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Notes (optional)
            <textarea
              rows={2}
              maxLength={LIMITS.pollNotes}
              value={draft.notes}
              onChange={event => setDraft({ ...draft, notes: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-teal-500"
            />
          </label>

          {draft.hasVotes && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This poll has responses. Create a new poll to change its options, voting method, or ranking limit.</p>}
          <fieldset disabled={draft.hasVotes || busy} className="space-y-2 disabled:opacity-60">
            <legend className="text-sm font-medium text-gray-700">
              Answer options ({POLL_MIN_OPTIONS}-{POLL_MAX_OPTIONS})
            </legend>
            {draft.options.map((option: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`poll-option-${index}`}>Option {index + 1}</label>
                <input
                  id={`poll-option-${index}`}
                  type="text"
                  maxLength={LIMITS.pollOption}
                  value={option}
                  onChange={(event) => {
                    const options = [...draft.options];
                    options[index] = event.target.value;
                    setDraft({ ...draft, options });
                  }}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-teal-500"
                  placeholder={`Option ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setDraft({
                    ...draft,
                    options: draft.options.filter((_: string, position: number) => position !== index),
                    optionIds: draft.optionIds?.filter((_: string, position: number) => position !== index),
                    maxRankedChoices: Math.min(Number(draft.maxRankedChoices), draft.options.length - 1),
                  })}
                  disabled={!canRemoveOption}
                  aria-label={`Remove option ${index + 1}`}
                  className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}
              disabled={!canAddOption}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40"
            >
              Add option
            </button>
          </fieldset>

          <fieldset disabled={draft.hasVotes || busy} className="space-y-3 disabled:opacity-60">
            <legend className="sr-only">Voting setup</legend>
            <label className="block text-sm font-medium text-gray-700">
              Voting method
              <select value={draft.votingMode} onChange={event => setDraft({ ...draft, votingMode: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2">
                {POLL_VOTING_MODES.map(mode => <option key={mode} value={mode}>{POLL_VOTING_MODE_LABELS[mode]}</option>)}
              </select>
            </label>
            {draft.votingMode === 'multiple' && <p className="text-sm text-gray-500">People can select every date or option that works for them. Each selection counts equally.</p>}
            {draft.votingMode === 'ranked' && <>
              <label className="block text-sm font-medium text-gray-700">
                Maximum ranked choices (K)
                <input type="number" required min={1} max={optionCount} step={1} value={draft.maxRankedChoices} onChange={event => setDraft({ ...draft, maxRankedChoices: event.target.value })} className="mt-1 block w-28 rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <p className="text-sm text-gray-500">Voters rank 1 to {draft.maxRankedChoices || 'K'} choices. First choice earns {draft.maxRankedChoices || 'K'} points, each next choice earns one fewer, and unranked options earn zero. Equal scores tie.</p>
            </>}
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Who can vote
              <select
                value={draft.audience}
                onChange={event => setDraft({ ...draft, audience: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                {POLL_AUDIENCES.map(audience => (
                  <option key={audience} value={audience}>{POLL_AUDIENCE_LABELS[audience]}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              When results are visible
              <select
                value={draft.resultVisibility}
                onChange={event => setDraft({ ...draft, resultVisibility: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                {POLL_RESULT_VISIBILITIES.map(visibility => (
                  <option key={visibility} value={visibility}>{POLL_RESULT_VISIBILITY_LABELS[visibility]}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Who can see results
              <select
                value={draft.resultAudience}
                onChange={event => setDraft({ ...draft, resultAudience: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                {POLL_RESULT_AUDIENCES.map(audience => (
                  <option key={audience} value={audience}>{POLL_RESULT_AUDIENCE_LABELS[audience]}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Linked event (optional)
              <select
                value={draft.eventId}
                onChange={event => setDraft({ ...draft, eventId: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                <option value="">Not linked</option>
                {eventOptions.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Opens (optional)
              <input
                type="datetime-local"
                value={draft.opensAt}
                onChange={event => setDraft({ ...draft, opensAt: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Closes (optional)
              <input
                type="datetime-local"
                value={draft.closesAt}
                onChange={event => setDraft({ ...draft, closesAt: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.allowVoteChange}
                onChange={event => setDraft({ ...draft, allowVoteChange: event.target.checked })}
                className="h-4 w-4"
              />
              Let people change their answer while the poll is open
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.showParticipation}
                onChange={event => setDraft({ ...draft, showParticipation: event.target.checked })}
                className="h-4 w-4"
              />
              Show the participation count publicly
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.privateVotes}
                onChange={event => setDraft({ ...draft, privateVotes: event.target.checked })}
                className="h-4 w-4"
              />
              Keep individual vote records private (admins only)
            </label>
            {!draft.privateVotes && (
              <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Public responses show a signed-in member's username and answer. Guest answers are labelled “Guest neighbor.”
                Responses cast while privacy was enabled remain private.
              </p>
            )}
            {draft.audience !== 'members' && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Guest uniqueness is best-effort. App Check, a browser participant ID, and per-IP throttling deter duplicate votes;
                use “Signed-in members only” when strict one-person enforcement matters.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setFormOpen(false)} className="flex-1 rounded-xl border border-gray-200 py-3 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-500 py-3 font-semibold text-white hover:bg-teal-600 disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              {draft.id ? 'Save poll' : 'Create poll'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
