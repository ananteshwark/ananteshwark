import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';

interface QrCodeProps {
  entityType: string;
  entityId: string;
  label?: string;
  size?: number;
  className?: string;
}

export function QrCode({ entityType, entityId, label, size = 128, className = '' }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError(false);
    apiClient
      .get('/platform/qr', { params: { entityType, entityId, label, format: 'json' } })
      .then((res) => {
        if (!cancelled) {
          const d = res.data?.data ?? res.data;
          setDataUrl(d?.dataUrl ?? null);
        }
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [entityType, entityId, label]);

  if (error) return <div className="text-xs text-gray-400">QR N/A</div>;
  if (!dataUrl) {
    return (
      <div
        className={`bg-gray-100 animate-pulse rounded ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <img
      src={dataUrl}
      alt={`QR: ${entityType} ${entityId}`}
      width={size}
      height={size}
      className={`rounded ${className}`}
    />
  );
}
