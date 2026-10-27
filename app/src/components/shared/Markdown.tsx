import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AppLink from './AppLink';

export default function Markdown({ children, className = '' }) {
  return (
    <div className={`prose prose-sm max-w-none prose-headings:text-gray-800 prose-a:text-teal-600 prose-strong:text-gray-800 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = '', ...props }) => href.startsWith('/')
            ? <AppLink {...props} to={href} />
            : <a {...props} href={href} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
