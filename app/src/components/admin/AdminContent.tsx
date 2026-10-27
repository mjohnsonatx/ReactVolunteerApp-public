// components/admin/AdminContent.jsx
import { useState, useEffect } from 'react';
import { Save, Check, User, Loader, Target, Leaf } from 'lucide-react';
import { sanitizeSiteContentForm, detectMalicious, LIMITS } from '../../utils/sanitize';
import { logError } from '../../utils/logError';
import { useApp } from '@runtime/app-context';
import { saveSiteContentFn } from '../../libs/callables';
import MarkdownEditor from '../shared/MarkdownEditor';
import Markdown from '../shared/Markdown';
import { resolveSiteContent } from '../../siteContent';

export default function AdminContent() {
  const { siteContent, isAdmin, runBackendTask } = useApp();
  const [draft, setDraft] = useState(() => resolveSiteContent(siteContent));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(resolveSiteContent(siteContent)); }, [siteContent]);
  const setAbout = (patch) => setDraft(d => ({ ...d, about: { ...d.about, ...patch } }));

  const handleSave = async () => {
    setError(''); setSaving(true);
    try {
      const clean = sanitizeSiteContentForm(draft);
      for (const [name, val] of [['Mission', clean.mission], ['Goals', clean.goals],
        ['Name', clean.about.name], ['Bio', clean.about.bio]]) {
        const { blocked, reason } = detectMalicious(val);
        if (blocked) { setError(`${name} blocked: ${reason}`); setSaving(false); return; }
      }
      await runBackendTask('Saving site content...', () => saveSiteContentFn(clean));
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (err) { setError('Could not save. Please try again.'); logError(err, 'siteContent-save'); }
    finally { setSaving(false); }
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      {/* About Me */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4"><User className="text-teal-600" /> About Me</h2>
        <div className="space-y-3">
          <input type="text" placeholder="Your name" maxLength={LIMITS.name} value={draft.about?.name || ''}
            onChange={e => setAbout({ name: e.target.value })}
            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none" />
          <MarkdownEditor label="Introduction" rows={6} maxLength={LIMITS.bio}
            value={draft.about?.bio || ''} onChange={v => setAbout({ bio: v })} />
        </div>
      </div>

      {/* Mission */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4"><Leaf className="text-emerald-600" /> Our Mission</h2>
        <MarkdownEditor maxLength={LIMITS.markdown} value={draft.mission || ''} onChange={v => setDraft(d => ({ ...d, mission: v }))} />
      </div>

      {/* Goals */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4"><Target className="text-teal-600" /> Our Goals</h2>
        <MarkdownEditor maxLength={LIMITS.markdown} value={draft.goals || ''} onChange={v => setDraft(d => ({ ...d, goals: v }))} />
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-white ${saving ? 'bg-gray-300' : 'bg-teal-500 hover:bg-teal-600'}`}>
          {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />} Save changes
        </button>
        {saved && <span className="text-emerald-600 text-sm flex items-center gap-1"><Check size={16} /> Saved</span>}
      </div>
    </div>
  );
}
