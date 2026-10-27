// Admin-only digest email settings. Kept apart from the push helpers so the
// desktop admin app can reuse it without loading the web app's Firebase setup.
import { getEmailDeliverySettingsFn, saveEmailDeliverySettingsFn, sendTestEmailFn } from '../libs/callables';

export type EmailDeliverySettings = {
  senderAddress: string;
  senderName: string;
  digestEnabled: boolean;
  smtpConfigured: boolean;
  lastDigestRunAt: string | null;
  lastDigestStatus: string;
  lastDigestSent: number;
  lastDigestFailed: number;
};

export async function loadEmailDeliverySettings(): Promise<EmailDeliverySettings> {
  const { data } = await getEmailDeliverySettingsFn();
  return data as EmailDeliverySettings;
}

export async function saveEmailDeliverySettings(settings: Pick<EmailDeliverySettings, 'senderAddress' | 'senderName' | 'digestEnabled'>) {
  const { data } = await saveEmailDeliverySettingsFn(settings);
  return data as Pick<EmailDeliverySettings, 'senderAddress' | 'senderName' | 'digestEnabled'>;
}

export async function sendTestEmail(): Promise<string> {
  const { data } = await sendTestEmailFn();
  return String((data as { to?: unknown })?.to || '');
}
