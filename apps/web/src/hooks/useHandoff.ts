import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Cross-page workflow handoff: a source page navigates with
 * `navigate(path, { state: { prefill } })` and the target page reads the
 * payload once via this hook to prefill its create form. History state is
 * cleared after capture so refresh/back does not re-trigger the prefill.
 */
export function useHandoff<T = any>(): T | null {
  const location = useLocation();
  const navigate = useNavigate();
  const captured = useRef<T | null>((location.state as any)?.prefill ?? null);

  useEffect(() => {
    if ((location.state as any)?.prefill) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return captured.current;
}
