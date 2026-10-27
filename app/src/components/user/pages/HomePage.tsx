// components/user/pages/HomePage.jsx
import { lazy, Suspense } from 'react';
import { Droplets, Leaf, MapPin, Target, Users, Mail, HelpCircle, ChevronDown, Check } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import OverlayPanel from '../../OverlayPanel';
import Markdown from '../../shared/Markdown';
import HomeActivity from '../HomeActivity';
import { resolveSiteContent } from '../../../siteContent';

const MapView = lazy(() => import('../../Map'));

const faqs = [
  { q: 'What should I bring?', a: 'We provide gloves and bags. Bring water and sunscreen.' },
  { q: 'Age requirement?', a: 'Under 16 must be with an adult.' },
  { q: 'What if it rains?', a: 'Check email morning-of for updates.' },
];

export default function HomePage() {
  const {
    siteContent, overlayGroups, effectiveVisibleIds, toggleOverlayGroup,
    submitted, signupError, form, setForm, setSignupError, handleSignup,
    mailSubmitted, mailForm, setMailForm, mailError, setMailError, handleMailingList,
    openFaq, setOpenFaq, publishedOverlayGroups
  } = useApp();
  const content = resolveSiteContent(siteContent);

  return (
    <div className="mx-auto grid max-w-[1600px] items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:grid-rows-[max-content_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <div className="bg-gradient-to-r from-slate-800 via-teal-700 to-amber-700 text-white rounded-2xl p-8 text-center shadow-sm">
          <Droplets size={40} className="mx-auto mb-3 opacity-80" />
          <h1 className="text-3xl font-bold mb-2">Creek &amp; Watershed Clean-Up</h1>
          <p className="text-teal-100">Protecting our local waterways together</p>
        </div>

        {/* Mission (Markdown from Firestore) */}
        <section aria-labelledby="home-mission-heading" className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 id="home-mission-heading" className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2"><Leaf className="text-emerald-600" size={24} /> Our Mission</h2>
          <Markdown>{content.mission}</Markdown>
        </section>
      </div>
      <HomeActivity />
      <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-2">
        {/* ── Map (half) + Goals (half) in one row ── */}
        <div className="grid md:grid-cols-2 gap-6">
          <section aria-labelledby="home-area-heading" className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 id="home-area-heading" className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-3"><MapPin className="text-teal-600" size={24} />Service Area</h2>
            <div className="relative w-full h-[320px]">
              <Suspense fallback={<div className="h-full rounded-xl bg-teal-50 grid place-items-center text-sm text-teal-700" role="status">Loading service-area map...</div>}>
                <MapView center={[30.244, -97.712]} zoom={14} height="100%"
                  overlayGroups={overlayGroups} visibleGroupIds={effectiveVisibleIds} />
              </Suspense>
              <OverlayPanel groups={publishedOverlayGroups} visibleIds={effectiveVisibleIds} onToggle={toggleOverlayGroup} />
            </div>
          </section>
          <section aria-labelledby="home-goals-heading" className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 id="home-goals-heading" className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-3"><Target className="text-teal-600" size={24} />Our Goals</h2>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
              <h3 className="font-semibold text-emerald-900 mb-2">Restoration plan priorities</h3>
              <Markdown className="text-sm text-emerald-900 prose-p:text-emerald-900 prose-li:my-1 prose-ul:my-0">
                {content.goals}
              </Markdown>
            </div>
          </section>
        </div>

        {/* Two ways to join, in one compact card. */}
        <section aria-labelledby="home-join-heading" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 id="home-join-heading" className="mb-4 text-xl font-bold text-gray-800">Join the effort</h2>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-0">
            <div className="min-w-0 lg:pr-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2"><Users className="text-teal-600" size={20} />Volunteer</h3>
              {submitted
                ? <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-2"><Check size={20} />Thanks for signing up!</div>
                : <form onSubmit={handleSignup} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="sr-only" htmlFor="volunteer-name">Volunteer name</label>
                      <input id="volunteer-name" type="text" autoComplete="name" placeholder="Name" required value={form.name}
                        onChange={e => { setSignupError(''); setForm({ ...form, name: e.target.value }); }}
                        className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none" />
                      <label className="sr-only" htmlFor="volunteer-email">Volunteer email</label>
                      <input id="volunteer-email" type="email" autoComplete="email" placeholder="Email" required value={form.email}
                        onChange={e => { setSignupError(''); setForm({ ...form, email: e.target.value }); }}
                        className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none" />
                      <label className="sr-only" htmlFor="volunteer-phone">Volunteer phone, optional</label>
                      <input id="volunteer-phone" type="tel" autoComplete="tel" placeholder="Phone (optional)" value={form.phone}
                        onChange={e => setForm({ ...form, phone: e.target.value })}
                        className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none" />
                    </div>
                    {signupError && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{signupError}</p>}
                    <button type="submit" className="rounded-lg bg-teal-500 px-6 py-2 font-medium text-white hover:bg-teal-600">Sign Up</button>
                  </form>}
            </div>
            <div className="min-w-0 border-t border-gray-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2"><Mail className="text-emerald-600" size={20} />Newsletter</h3>
              {mailSubmitted
                ? <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-2"><Check size={20} />Subscribed!</div>
                : <form onSubmit={handleMailingList} className="space-y-3">
                    <label className="sr-only" htmlFor="newsletter-email">Newsletter email</label>
                    <input id="newsletter-email" type="email" autoComplete="email" placeholder="Email" required value={mailForm} onChange={e => { setMailError(''); setMailForm(e.target.value); }}
                      className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 outline-none" />
                    {mailError && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{mailError}</p>}
                    <button type="submit" className="rounded-lg bg-emerald-500 px-6 py-2 font-medium text-white hover:bg-emerald-600">Subscribe</button>
                  </form>}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><HelpCircle className="text-teal-600" size={24} />FAQ</h2>
          <div className="space-y-2">{faqs.map((f, i) => (
            <div key={i} className="border border-gray-100 rounded-xl">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                <span className="font-medium text-gray-700">{f.q}</span>
                <ChevronDown size={18} className={`text-gray-400 transition ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && <div className="px-4 py-3 bg-gray-50 text-gray-600 border-t">{f.a}</div>}
            </div>
          ))}</div>
        </div>
      </div>
    </div>
  );
}
