// components/user/AboutMe.jsx
import { useApp } from '../../context/AppContext';
import Markdown from '../shared/Markdown';
import { resolveSiteContent } from '../../siteContent';

export default function AboutMe() {
  const { siteContent } = useApp();
  const { name, bio } = resolveSiteContent(siteContent).about;

  return (
    <section
      aria-labelledby="about-me-heading"
      className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8"
    >
      <h1 id="about-me-heading" className="text-2xl font-bold text-gray-800">About Me</h1>
      {name && <h2 className="mt-3 text-lg font-semibold text-teal-700">{name}</h2>}
      {bio
        ? <Markdown className="mt-4">{bio}</Markdown>
        : <p className="mt-4 text-sm text-gray-400">Introduction coming soon.</p>}
    </section>
  );
}
