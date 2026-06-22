import { useState, useEffect, useRef } from 'react';
import { Paperclip, Download, Trash2, Upload, FileText } from 'lucide-react';
import { attachmentsApi, type Attachment } from '../api/attachments';

interface Props {
  entityType: string;
  entityId: string;
  readOnly?: boolean;
}

const humanSize = (bytes: number): string => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export default function AttachmentsList({ entityType, entityId, readOnly }: Props) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await attachmentsApi.list(entityType, entityId);
      setItems(res.data?.data ?? res.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await attachmentsApi.upload(entityType, entityId, file);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (att: Attachment) => {
    try {
      await attachmentsApi.download(att.id, att.originalName);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Download failed');
    }
  };

  const handleDelete = async (att: Attachment) => {
    if (!window.confirm(`Delete "${att.originalName}"?`)) return;
    setError(null);
    try {
      await attachmentsApi.remove(att.id);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Delete failed');
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Paperclip className="w-4 h-4" /> Attachments
        </h3>
        {!readOnly && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Attach'}
            </button>
          </>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Loading...</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-400">No attachments yet.</p>
      )}

      <ul className="divide-y divide-gray-100">
        {items.map((att) => (
          <li key={att.id} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">{att.originalName}</p>
                <p className="text-xs text-gray-400">{humanSize(att.fileSize)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownload(att)}
                title="Download"
                className="p-1 text-gray-500 hover:text-indigo-600"
              >
                <Download className="w-4 h-4" />
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDelete(att)}
                  title="Delete"
                  className="p-1 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
