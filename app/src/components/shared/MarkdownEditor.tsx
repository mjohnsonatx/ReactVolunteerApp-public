// components/shared/MarkdownEditor.jsx
import { useRef, useState } from 'react';
import { Bold, Italic, Heading, List, ListOrdered, Quote, Link2, Eye, Edit3 } from 'lucide-react';
import Markdown from './Markdown';

type MarkdownEditorProps = {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  rows?: number;
  maxLength?: number;
};

export default function MarkdownEditor({ value = '', onChange, label, rows = 10, maxLength }: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);

  const surround = (before: string, after = before) => {
    const ta = ref.current; if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = s + before.length; ta.selectionEnd = e + before.length; });
  };
  const prefixLines = (prefix: string) => {
    const ta = ref.current; if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const block = value.slice(lineStart, e)
      .split('\n').map((l, i) => (prefix === '1. ' ? `${i + 1}. ${l}` : prefix + l)).join('\n');
    onChange(value.slice(0, lineStart) + block + value.slice(e));
    requestAnimationFrame(() => ta.focus());
  };

  const tools = [
    { icon: Bold, title: 'Bold', fn: () => surround('**') },
    { icon: Italic, title: 'Italic', fn: () => surround('_') },
    { icon: Heading, title: 'Heading', fn: () => prefixLines('## ') },
    { icon: List, title: 'Bullet list', fn: () => prefixLines('- ') },
    { icon: ListOrdered, title: 'Numbered list', fn: () => prefixLines('1. ') },
    { icon: Quote, title: 'Quote', fn: () => prefixLines('> ') },
    { icon: Link2, title: 'Link', fn: () => surround('[', '](https://)') },
  ];

  return (
    <div>
      {label && <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b">
          {tools.map((t, i) => (
            <button key={i} type="button" title={t.title} onClick={t.fn}
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-200"><t.icon size={16} /></button>
          ))}
          <button type="button" onClick={() => setPreview(p => !p)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-teal-600 hover:bg-teal-50">
            {preview ? <><Edit3 size={14} /> Write</> : <><Eye size={14} /> Preview</>}
          </button>
        </div>
        {preview ? (
          <div className="p-4 min-h-[160px] bg-white">
            {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-gray-400 text-sm">Nothing to preview yet.</p>}
          </div>
        ) : (
          <textarea ref={ref} rows={rows} value={value} maxLength={maxLength}
            onChange={e => onChange(e.target.value)}
            placeholder="Write Markdown… **bold**, _italic_, - lists"
            className="w-full p-4 outline-none font-mono text-sm resize-y" />
        )}
      </div>
      {maxLength && <p className="text-xs text-gray-400 mt-1 text-right">{value.length}/{maxLength}</p>}
    </div>
  );
}
