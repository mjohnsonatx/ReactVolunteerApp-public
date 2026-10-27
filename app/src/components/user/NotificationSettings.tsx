import { useEffect, useState } from 'react';
import { Bell, BellOff, Check, Loader2, Share, Smartphone } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  isPushEnabledOnThisDevice,
  loadNotificationSettings,
  notificationErrorMessage,
  pushSupport,
  refreshPushRegistration,
  saveNotificationPreferences,
  type NotificationSettings as Settings,
} from '../../services/notifications';
import { logError } from '../../utils/logError';
import {
  NOTIFICATION_TOPICS,
  NOTIFICATION_TOPIC_LABELS,
  type NotificationPreferences,
  type NotificationTopic,
} from '@watershed/shared';

const PUSH_MESSAGES: Record<string, string> = {
  'not-configured': 'Push notifications are not available on this site yet.',
  unsupported: 'This browser cannot show notifications. Try Chrome, Edge, Firefox, or Safari.',
  denied: 'Notifications are blocked for this site. Allow them in your browser settings, then reload this page.',
};

export default function NotificationSettings() {
  const { currentUser } = useApp();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [support, setSupport] = useState(() => pushSupport());
  const [deviceEnabled, setDeviceEnabled] = useState(() => isPushEnabledOnThisDevice());
  const [deviceBusy, setDeviceBusy] = useState(false);
  const verified = currentUser?.emailVerified === true;

  useEffect(() => {
    let active = true;
    loadNotificationSettings()
      .then(result => { if (active) setSettings(result); })
      .catch(err => {
        if (active) setLoadError('Could not load your notification settings.');
        logError(err, 'NotificationSettings-load');
      });
    refreshPushRegistration().catch(err => logError(err, 'NotificationSettings-refresh'));
    return () => { active = false; };
  }, []);

  if (!currentUser) return null;

  const save = async (next: NotificationPreferences) => {
    if (!settings) return;
    const previous = settings.preferences;
    setSettings({ ...settings, preferences: next });
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const clean = await saveNotificationPreferences(next);
      setSettings(current => (current ? { ...current, preferences: clean } : current));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSettings(current => (current ? { ...current, preferences: previous } : current));
      setError(notificationErrorMessage(err, 'Could not save your notification settings.'));
      logError(err, 'NotificationSettings-save');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (topic: NotificationTopic) => {
    if (!settings) return;
    const current = settings.preferences[topic];
    save({ ...settings.preferences, [topic]: { ...current, push: !current.push } });
  };

  const toggleDevice = async () => {
    setDeviceBusy(true);
    setError('');
    try {
      if (deviceEnabled) {
        await disablePushOnThisDevice();
        setSettings(current => (current ? { ...current, pushDevices: Math.max(0, current.pushDevices - 1) } : current));
      } else {
        await enablePushOnThisDevice();
        setSettings(current => (current ? { ...current, pushDevices: current.pushDevices + 1 } : current));
      }
    } catch (err) {
      setError(notificationErrorMessage(err, 'Could not change notifications for this device.'));
      logError(err, 'NotificationSettings-device');
    } finally {
      setDeviceEnabled(isPushEnabledOnThisDevice());
      setSupport(pushSupport());
      setDeviceBusy(false);
    }
  };

  const pushChosen = settings ? NOTIFICATION_TOPICS.some(topic => settings.preferences[topic].push) : false;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Bell size={18} className="text-teal-600" />Notifications</h3>
        <span className="text-xs text-gray-500" aria-live="polite">
          {saving && <><Loader2 size={12} className="inline animate-spin" /> Saving…</>}
          {!saving && saved && <span className="text-emerald-600"><Check size={12} className="inline" /> Saved</span>}
        </span>
      </div>

      <div className="px-4 sm:px-6 py-4 border-b border-gray-50">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Smartphone size={18} className="shrink-0 text-gray-400 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">Push notifications on this device</p>
              {support === 'supported' && (
                <p className="text-xs text-gray-500">
                  {deviceEnabled
                    ? 'On. This browser shows a notification for the updates you choose below.'
                    : 'Off. Turn it on to get alerts even when the site is closed.'}
                </p>
              )}
              {support === 'needs-install' && (
                <p className="text-xs text-gray-600">
                  On iPhone or iPad, tap <Share size={12} className="inline" aria-label="Share" /> Share, then <strong>Add to Home Screen</strong>.
                  Open WatershedCrew from your Home Screen and turn notifications on there.
                </p>
              )}
              {PUSH_MESSAGES[support] && <p className="text-xs text-gray-500">{PUSH_MESSAGES[support]}</p>}
            </div>
          </div>
          {support === 'supported' && (
            <button
              onClick={toggleDevice}
              disabled={deviceBusy || !verified}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                deviceEnabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-teal-500 text-white hover:bg-teal-600'
              }`}
            >
              {deviceBusy ? <Loader2 size={14} className="animate-spin" /> : deviceEnabled ? <BellOff size={14} /> : <Bell size={14} />}
              {deviceEnabled ? 'Turn off' : 'Turn on'}
            </button>
          )}
        </div>
        {deviceEnabled && !pushChosen && settings && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">Choose which updates to push in the settings below.</p>
        )}
      </div>

      <div className="px-4 sm:px-6 py-4">
        {!verified && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">Verify your email address to turn on notifications.</p>}
        {loadError && <p className="text-xs text-red-500 mb-3">{loadError}</p>}
        {error && <p className="text-xs text-red-500 mb-3" role="alert">{error}</p>}
        {!settings && !loadError && <p className="text-sm text-gray-500"><Loader2 size={14} className="inline animate-spin" /> Loading…</p>}
        {settings && (
          <fieldset className="min-w-0 text-sm">
            <legend className="sr-only">Choose which updates to push</legend>
            <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_5rem] gap-3 pb-2 text-xs font-medium text-gray-500 sm:grid">
              <span>Update</span>
              <span className="flex items-center justify-center gap-1 whitespace-nowrap"><Bell size={14} /> Push</span>
            </div>
            <div className="divide-y divide-gray-100">
              {NOTIFICATION_TOPICS.map(topic => (
                <div key={topic} role="group" aria-labelledby={`notification-topic-${topic}`} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-x-3 gap-y-1 py-3">
                  <div className="min-w-0">
                    <span id={`notification-topic-${topic}`} className="block font-medium text-gray-800">{NOTIFICATION_TOPIC_LABELS[topic].label}</span>
                    <span className="block text-xs text-gray-500">{NOTIFICATION_TOPIC_LABELS[topic].description}</span>
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-gray-600 sm:justify-center">
                    <input
                      type="checkbox"
                      aria-label={`Push: ${NOTIFICATION_TOPIC_LABELS[topic].label}`}
                      checked={settings.preferences[topic].push}
                      disabled={!verified || saving}
                      onChange={() => toggle(topic)}
                      className="w-4 h-4 accent-teal-600"
                    />
                    <span className="sm:sr-only">Push</span>
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        )}
        {settings && pushChosen && settings.pushDevices === 0 && (
          <p className="text-xs text-gray-500 mt-3 break-words [overflow-wrap:anywhere]">
            Push updates need at least one device turned on above.
          </p>
        )}
      </div>
    </div>
  );
}
