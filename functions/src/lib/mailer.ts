import nodemailer from 'nodemailer';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebaseAdmin';
import { sanitizeEmail, sanitizeSenderName } from '../shared';
import { assertNotificationLease, type NotificationLease } from './notificationLease';

// Only the notify identity reads the Brevo SMTP key. Keep delivery disabled in
// every project until its own key and login are configured: Firebase validates
// secret declarations even when an unrelated Functions subset is deployed.
export const brevoSmtpKey = process.env.WATERSHED_EMAIL_ENABLED === 'true'
  ? defineSecret('BREVO_SMTP_KEY') : undefined;
export const emailSecrets = brevoSmtpKey ? [brevoSmtpKey] : [];

const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

export const emailConfigRef = () => db.collection('notificationConfig').doc('email');

export type EmailConfig = {
  senderAddress: string;
  senderName: string;
  digestEnabled: boolean;
  lastDigestRunAt: string | null;
  lastDigestStatus: string;
  lastDigestSent: number;
  lastDigestFailed: number;
};

function isoTime(value: unknown): string | null {
  return value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : null;
}

export async function loadEmailConfig(): Promise<EmailConfig> {
  const data = (await emailConfigRef().get()).data() ?? {};
  return {
    senderAddress: sanitizeEmail(data.senderAddress),
    senderName: sanitizeSenderName(data.senderName) || 'WatershedCrew',
    digestEnabled: data.digestEnabled === true,
    lastDigestRunAt: isoTime(data.lastDigestRunAt),
    lastDigestStatus: typeof data.lastDigestStatus === 'string' ? data.lastDigestStatus : '',
    lastDigestSent: Number(data.lastDigestSent) || 0,
    lastDigestFailed: Number(data.lastDigestFailed) || 0,
  };
}

export async function recordDigestRun(status: string, sent: number, failed: number, lease: NotificationLease): Promise<void> {
  await db.runTransaction(async tx => {
    await assertNotificationLease(tx, lease);
    tx.set(emailConfigRef(), {
      lastDigestRunAt: FieldValue.serverTimestamp(),
      lastDigestStatus: status,
      lastDigestSent: sent,
      lastDigestFailed: failed,
    }, { merge: true });
  });
}

/** The secret value is never returned to the browser or stored in Firestore. */
export function smtpKey(): string {
  const raw = isEmulator() ? process.env.BREVO_SMTP_KEY || '' : brevoSmtpKey?.value() || '';
  return raw.trim();
}

export function smtpConfigured(): boolean {
  return !!smtpKey() && !!process.env.BREVO_SMTP_LOGIN?.trim();
}

export type MailContent = { subject: string; text: string; html: string };
export type Mailer = { send: (to: string, content: MailContent) => Promise<void> };

export function createMailer(config: EmailConfig, key: string): Mailer {
  // Emulator runs never contact Brevo; nodemailer renders the message locally.
  const transport = isEmulator()
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: process.env.BREVO_SMTP_LOGIN?.trim() || '', pass: key },
    });
  return {
    send: async (to, content) => {
      await transport.sendMail({
        from: { name: config.senderName, address: config.senderAddress },
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
    },
  };
}

/** Turns SMTP failures into a message an administrator can act on. */
export function mailFailure(error: unknown): HttpsError {
  const code = (error as { code?: unknown })?.code;
  if (code === 'EAUTH') {
    return new HttpsError('failed-precondition',
      'Brevo rejected the SMTP login or key. Check the SMTP credentials under Brevo Settings → SMTP & API.');
  }
  return new HttpsError('unavailable', 'The email could not be sent. Please try again later.');
}
