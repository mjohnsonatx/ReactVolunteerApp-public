// components/user/pages/PrivacyPage.jsx
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../../../context/AppContext';

const sections = [
  {
    title: 'Information we collect',
    items: [
      'Contact and account details you provide, such as your name, user name, email address, phone number, and password credentials handled by Firebase Authentication.',
      'Volunteer activity details, including signups, event RSVPs, mailing-list subscriptions, forum posts and replies, event comments and reports, poll answers, flags, profile updates, messages you send to the site administrator, and documents or files you choose to upload.',
      'When you view polls, a random identifier stored in your browser is sent with poll requests. For guest votes, the voting function hashes it with the poll ID and a server-side secret before storing a voter key. This limits repeat votes from one browser; it does not identify one person.',
      'Technical and usage data, including browser and device details, page URLs and error diagnostics, IP addresses used for abuse limits, Firebase App Check information, and Google Analytics usage events. Error records can include your account ID when you are signed in.',
      'If you turn on notifications: your choices for each kind of update and, for each browser or device where you enable push notifications, a push registration token issued by Firebase Cloud Messaging.',
    ],
  },
  {
    title: 'How we use information',
    items: [
      'To create and manage accounts, send verification and account-management emails, coordinate volunteer activities, handle event participation, publish approved community content, and respond to support or safety issues.',
      'To review and respond to messages you submit from your user profile, including the topic you choose and the freeform message you provide.',
      'To protect the site from abuse, enforce moderation decisions, maintain security, troubleshoot errors, measure site usage with Google Analytics, and improve reliability.',
      'To send messages related to volunteer coordination, account activity, mailing-list subscriptions, or changes to services and policies.',
      'Only if you opt in: to send push notifications to the devices you enable about replies in your forum threads, new forum posts, and new volunteer events.',
    ],
  },
  {
    title: 'What other visitors can see',
    items: [
      'Forum posts, replies, and event comments display your username unless you choose to post anonymously. Anonymous content hides your username and account ID from other visitors, but administrators can still see who submitted it for moderation. Your text may identify you if you include personal details.',
      'Approved, published public documents and their titles, notes, and file contents can be viewed by visitors.',
      'For a poll configured with public individual responses, a signed-in member’s username and selected answer can be shown to other visitors. Guest responses show a generic guest label. Other polls keep individual responses available to administrators only.',
    ],
  },
  {
    title: 'How information is shared',
    items: [
      'We do not sell personal information.',
      'We share information with service providers that help operate the site, including Firebase and Google Cloud services for hosting, authentication, analytics, database, storage, security, and cloud functions.',
      'When your browser loads maps, plant photos, or map icons, it requests some content directly from external providers, including OpenStreetMap, Wikimedia Commons, USGS-hosted images, and cdnjs. Those providers may receive your IP address and browser request details under their own policies.',
      'We may disclose information if required by law, to protect rights and safety, to investigate abuse, or with your direction or consent.',
    ],
  },
  {
    title: 'Your choices',
    items: [
      'You can update account profile details from your profile or account settings when signed in.',
      'You can message the site administrator from your signed-in profile by choosing a topic and sending a short freeform message.',
      'You can delete your account from account settings or request help from an administrator. This removes your sign-in, profile, uploads, RSVPs, support messages, event comments, member vote records, notification settings and push registrations, error logs linked to your account, and matching volunteer or mailing-list entries. Your forum posts and replies are retained with their author details and text removed; aggregate poll totals may remain.',
      'You can unsubscribe from mailing-list communications by contacting the site administrator or using any unsubscribe process provided in a message.',
      'Notifications are off unless you turn them on. You can change or stop push notifications at any time from the Notifications section of your profile; signing out also turns off push on that browser.',
      'You can control cookies and similar storage through your browser, though blocking essential storage may prevent sign-in or security features from working.',
    ],
  },
  {
    title: 'Retention and security',
    items: [
      'We keep active records while needed to provide the site. Account deletion removes or anonymizes the records described above. Guest poll votes and records submitted independently without your account may not be linked to your account deletion request.',
      'Account-linked rate-limit records are removed on account deletion. Other rate-limit records carry expiration timestamps and depend on the configured database cleanup policy. Service-provider logs and backups may persist under the provider’s retention settings; contact us if you need help with a specific record or deletion request.',
      'We use Firebase security rules, server-side callable functions, authentication checks, and role-based admin access to limit who can read or change data.',
      'Queued digest items are deleted after they are emailed or within three days. Push registrations are deleted when you turn push off, sign out, or the browser reports them as no longer valid.',
      'No online service can guarantee perfect security, but we work to protect information using reasonable technical and organizational safeguards.',
    ],
  },
];

export default function PrivacyPage() {
  const { setPage } = useApp();
  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 max-w-4xl mx-auto">
      <button onClick={() => setPage('home')} className="flex items-center gap-2 text-teal-600 hover:text-teal-700 mb-4"><ArrowLeft size={18} />Back</button>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-6">Last updated October 16, 2026</p>
      <div className="text-gray-600 space-y-6 text-sm leading-relaxed">
        <p>
          WatershedCrew is a volunteer coordination site. This policy explains the general types of information
          we collect, how we use it, and the choices available to visitors, volunteers, and administrators.
        </p>

        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-800">{section.title}</h2>
            <ul className="list-disc pl-5 space-y-2">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">Children's privacy</h2>
          <p>
            This site is not directed to children under 13. If you believe a child has provided personal
            information without appropriate permission, contact the site administrator so the information can be reviewed.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">Policy updates</h2>
          <p>
            We may update this policy as the site changes. The updated date above shows when this page was last revised.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">Contact</h2>
          <p>
            For privacy, account, or volunteer-site questions, email{' '}
            <a className="text-teal-600 hover:text-teal-700" href="mailto:tilleryvolunteeradmin@gmail.com">
              tilleryvolunteeradmin@gmail.com
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
