import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X, QrCode, Search, Flashlight } from 'lucide-react';

interface ScannedResult {
  entityType: string;
  entityId: string;
  label?: string;
  raw: string;
}

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  PO: (id) => `/procurement/po/${id}`,
  GRN: (id) => `/procurement/grn/${id}`,
  ASSET: (id) => `/finance/fixed-assets`,
  EMPLOYEE: (id) => `/hr/employees`,
  ITEM: (id) => `/inventory`,
};

function parseQrContent(raw: string): ScannedResult | null {
  try {
    const data = JSON.parse(raw);
    if (data.t && data.id) {
      return { entityType: data.t, entityId: data.id, label: data.l, raw };
    }
  } catch {}
  return null;
}

export default function QrScannerPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);
  const detectorRef = useRef<any>(null);

  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScannedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    // Check if BarcodeDetector is available
    if (typeof (window as any).BarcodeDetector === 'undefined') {
      setSupported(false);
    } else {
      detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
    }
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const startCamera = async () => {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      scanLoop();
    } catch (e: any) {
      setError(e?.message ?? 'Camera access denied');
    }
  };

  const scanLoop = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < 2) {
      animRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    detectorRef.current
      .detect(canvas)
      .then((barcodes: any[]) => {
        if (barcodes.length > 0) {
          const raw = barcodes[0].rawValue;
          const parsed = parseQrContent(raw);
          if (parsed) {
            setResult(parsed);
            stopCamera();
            return;
          }
        }
        animRef.current = requestAnimationFrame(scanLoop);
      })
      .catch(() => {
        animRef.current = requestAnimationFrame(scanLoop);
      });
  }, []);

  const handleManualSubmit = () => {
    const parsed = parseQrContent(manualInput.trim());
    if (parsed) {
      setResult(parsed);
    } else {
      setError('Invalid QR content format');
    }
  };

  const navigateToEntity = () => {
    if (!result) return;
    const routeFn = ENTITY_ROUTES[result.entityType];
    if (routeFn) {
      navigate(routeFn(result.entityId));
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <QrCode className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QR Scanner</h1>
          <p className="text-sm text-gray-500">Scan QR codes on POs, GRNs, assets, and more</p>
        </div>
      </div>

      {/* Camera area */}
      <div className="bg-gray-900 rounded-2xl overflow-hidden aspect-square relative">
        {scanning ? (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-2 border-white rounded-xl relative">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-lg" />
                {/* Scan line animation */}
                <div className="absolute inset-x-0 top-0 h-0.5 bg-indigo-400 animate-ping" />
              </div>
            </div>
            <button
              onClick={stopCamera}
              className="absolute top-3 right-3 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
            >
              <X className="w-5 h-5" />
            </button>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white">
            <QrCode className="w-16 h-16 opacity-30" />
            <p className="text-sm opacity-50">Camera not active</p>
          </div>
        )}
        {/* Hidden canvas for BarcodeDetector */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      {!scanning && (
        <div className="space-y-3">
          {supported ? (
            <button
              onClick={startCamera}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
            >
              <Camera className="w-5 h-5" />
              Start Camera
            </button>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
              Camera QR scanning requires Chrome on Android or a desktop browser with BarcodeDetector support.
              Use manual input below.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Manual input fallback */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Manual QR Content</label>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
            value={manualInput}
            placeholder='{"t":"PO","id":"uuid"}'
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
          />
          <button
            onClick={handleManualSubmit}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            <Search className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="font-semibold text-green-800">QR Decoded</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-1">Entity Type</p>
              <p className="font-semibold text-gray-800">{result.entityType}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Entity ID</p>
              <p className="font-mono text-xs text-gray-700">{result.entityId}</p>
            </div>
            {result.label && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-1">Label</p>
                <p className="text-gray-800">{result.label}</p>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            {ENTITY_ROUTES[result.entityType] && (
              <button
                onClick={navigateToEntity}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium"
              >
                Open {result.entityType}
              </button>
            )}
            <button
              onClick={() => { setResult(null); setManualInput(''); }}
              className="flex-1 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Scan Again
            </button>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Quick Scan Actions</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'GRN Confirm', desc: 'Confirm GRN receipt lines', color: 'blue' },
            { label: 'Attendance', desc: 'QR clock-in/out', color: 'green' },
            { label: 'Asset Lookup', desc: 'Find asset record', color: 'purple' },
            { label: 'Inventory', desc: 'Look up inventory item', color: 'orange' },
          ].map((action) => (
            <div
              key={action.label}
              className="bg-gray-50 border rounded-xl p-3 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={startCamera}
            >
              <p className="text-sm font-medium text-gray-800">{action.label}</p>
              <p className="text-xs text-gray-500">{action.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
