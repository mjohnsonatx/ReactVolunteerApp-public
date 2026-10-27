import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { resolveStoragePath } from '../../services/storageUrls';
import { recordHandledError } from '../../utils/crashReporting';

type StorageImageProps = {
  path: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  loadingLabel?: string;
};

// Renders an image from a trusted Storage *path*. Download URLs are resolved
// on demand (and cached) so nothing but the scoped path is ever persisted.
export default function StorageImage({
  path,
  alt,
  className = '',
  wrapperClassName = '',
  loadingLabel = 'Loading image',
}: StorageImageProps) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    if (!path) {
      setStatus('error');
      return () => { active = false; };
    }
    setStatus('loading');
    resolveStoragePath(path)
      .then((resolved) => {
        if (!active) return;
        setUrl(resolved);
        setStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        setStatus('error');
        recordHandledError(err, 'storageImage-resolve', { path });
      });
    return () => { active = false; };
  }, [path]);

  if (status === 'loading') {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 text-gray-400 ${wrapperClassName || className}`}
        role="status"
        aria-live="polite"
      >
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        <span className="sr-only">{loadingLabel}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-gray-100 text-gray-400 text-xs ${wrapperClassName || className}`}
        role="img"
        aria-label={`${alt} (image unavailable)`}
      >
        <ImageOff size={18} aria-hidden="true" />
        <span>Image unavailable</span>
      </div>
    );
  }

  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
