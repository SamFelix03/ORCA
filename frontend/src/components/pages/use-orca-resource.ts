"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useOrcaResource<T>(load: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    setError(null);
    const result = await loadRef.current();
    setData(result);
    return result;
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.resolve()
      .then(() => {
        if (!mounted) return null;
        setLoading(true);
        setError(null);
        return load();
      })
      .then((result) => {
        if (mounted && result) setData(result);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const safeReload = useCallback(async () => {
    try {
      return await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    }
  }, [reload]);

  return { data, loading, error, reload: safeReload };
}
