import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PdfPreview from '../../src/components/PdfPreview';
import '../../src/index.css';

export default function Harness() {
  const [file, setFile] = useState<File | null>(null);
  return <>
    <input type="file" aria-label="PDF fixture" accept="application/pdf"
      onChange={event => setFile(event.target.files?.[0] || null)} />
    <div style={{ width: 'calc(100vw - 32px)', height: '90vh' }}>
      {file && <PdfPreview blob={file} docId="render-regression" title="Rendering fixture" />}
    </div>
  </>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
