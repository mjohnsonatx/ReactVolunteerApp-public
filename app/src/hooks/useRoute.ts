import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseRoute, type AppRoute } from '../router/routes';
import { PUBLIC_DOCUMENTS_ENABLED } from '../features';

function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

const APP_HISTORY_ENTRY = '__watershedCrewNavigation';

export type Navigate = (path: string, options?: { replace?: boolean }) => void;
export type GoBack = (fallbackPath: string) => void;

// History-backed route state. Hosting already rewrites every path to
// index.html, so deep links land on the right screen after a hard refresh.
export function useRoute(): { route: AppRoute; navigate: Navigate; goBack: GoBack } {
  const [path, setPath] = useState<string>(() => currentPath());

  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback<Navigate>((next, options = {}) => {
    const target = next || '/';
    if (typeof window !== 'undefined' && target !== currentPath()) {
      if (options.replace) window.history.replaceState({ [APP_HISTORY_ENTRY]: true }, '', target);
      else window.history.pushState({ [APP_HISTORY_ENTRY]: true }, '', target);
    }
    setPath(target);
  }, []);

  const goBack = useCallback<GoBack>((fallbackPath) => {
    if (typeof window !== 'undefined' && window.history.state?.[APP_HISTORY_ENTRY]) {
      window.history.back();
      return;
    }
    navigate(fallbackPath, { replace: true });
  }, [navigate]);

  const route = useMemo(() => parseRoute(path), [path]);

  // Replace disabled deep links rather than leaving an unusable document URL
  // in history. Also handles browser back/forward into an older bookmark.
  useEffect(() => {
    if (!PUBLIC_DOCUMENTS_ENABLED && /^\/+(documents|documentDetail)(?:[/?#]|$)/.test(path)) {
      navigate('/', { replace: true });
    }
  }, [path, navigate]);

  return { route, navigate, goBack };
}
