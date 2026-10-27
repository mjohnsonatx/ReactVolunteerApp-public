// components/user/pages/CookiePage.jsx
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../../../context/AppContext';

const cookieTypes = [
  {
    title: 'Essential cookies and local storage',
    description: 'Used to keep the site working and remember preferences such as hidden map items. Viewing polls also stores a random browser identifier locally; guest voting uses it to limit repeat votes from that browser.',
  },
  {
    title: 'Security and abuse-prevention storage',
    description: 'Used by Firebase App Check with reCAPTCHA v3 to help verify legitimate traffic, reduce spam or abuse, and protect Firebase resources.',
  },
  {
    title: 'Authentication storage',
    description: 'Used by Firebase Authentication to keep signed-in users connected to their accounts and to support account-management features.',
  },
  {
    title: 'Analytics storage',
    description: 'The public website initializes Google Analytics, which can use browser identifiers and automatically collected events to measure site usage.',
  },
];

export default function CookiePage() {
  const { setPage } = useApp();
  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 max-w-4xl mx-auto">
      <button onClick={() => setPage('home')} className="flex items-center gap-2 text-teal-600 hover:text-teal-700 mb-4"><ArrowLeft size={18} />Back</button>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Cookie Policy</h1>
      <p className="text-sm text-gray-500 mb-6">Last updated October 2, 2026</p>
      <div className="text-gray-600 space-y-6 text-sm leading-relaxed">
        <p>
          This policy explains how WatershedCrew uses cookies and similar browser technologies, including
          local storage, session storage, Firebase tokens, and security-related browser storage.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">What cookies are</h2>
          <p>
            Cookies and similar technologies are small pieces of data stored on your device. They help websites
            remember information, keep accounts signed in, protect forms, and understand whether the site is working.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">How we use cookies and similar technologies</h2>
          <div className="space-y-3">
            {cookieTypes.map((type) => (
              <div key={type.title} className="border-l-4 border-teal-100 pl-4">
                <h3 className="font-semibold text-gray-800">{type.title}</h3>
                <p>{type.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">Third-party services</h2>
          <p>
            The site uses Firebase and Google services for hosting, authentication, security, database, storage,
            cloud functions, and analytics. Those services may set or read cookies and similar storage
            to provide their features and protect against abuse.
          </p>
          <p>
            Maps and images also load from external providers described in our Privacy Policy. They receive
            browser requests directly and may apply their own storage policies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">Your controls</h2>
          <p>
            You can block, delete, or limit cookies and local storage through your browser settings. If you block
            essential or authentication-related storage, some features may stop working, including sign-in, account
            settings, form submissions, document access, and security checks.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">Policy updates</h2>
          <p>
            We may update this policy as the site, Firebase configuration, or browser technologies change. The updated
            date above shows when this page was last revised.
          </p>
        </section>
      </div>
    </div>
  );
}
