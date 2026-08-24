import React, { useState, useRef, useEffect } from 'react';
import { X, PenTool, Type, Upload, RotateCcw, Check } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSignature: (dataUrl: string) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSaveSignature,
}) => {
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedName, setTypedName] = useState('John Doe');
  const [selectedFont, setSelectedFont] = useState('font-sig-dancing');
  const [sigColor, setSigColor] = useState('#0f172a');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (isOpen && tab === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
      }
    }
  }, [isOpen, tab]);

  if (!isOpen) return null;

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    lastPoint.current = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !lastPoint.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const currentPoint = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.strokeStyle = sigColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastPoint.current = currentPoint;
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    isDrawing.current = false;
    lastPoint.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedImage(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (tab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) {
        alert('Please draw a signature first.');
        return;
      }
      onSaveSignature(canvas.toDataURL('image/png'));
      onClose();
    } else if (tab === 'type') {
      if (!typedName.trim()) {
        alert('Please enter a name.');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 600, 200);
        let fontName = 'Dancing Script';
        if (selectedFont === 'font-sig-great') fontName = 'Great Vibes';
        if (selectedFont === 'font-sig-pacifico') fontName = 'Pacifico';
        if (selectedFont === 'font-sig-sacramento') fontName = 'Sacramento';

        ctx.font = `64px "${fontName}", cursive`;
        ctx.fillStyle = sigColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typedName, 300, 100);

        onSaveSignature(canvas.toDataURL('image/png'));
        onClose();
      }
    } else if (tab === 'upload') {
      if (uploadedImage) {
        onSaveSignature(uploadedImage);
        onClose();
      } else {
        alert('Please upload an image first.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-[#0071e3]/10 text-[#0071e3] rounded-lg">
              <PenTool className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Add Signature</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 hover:bg-black/5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/5 bg-slate-50 p-1">
          {[
            { id: 'draw', label: 'Draw', icon: <PenTool className="w-3.5 h-3.5" /> },
            { id: 'type', label: 'Type', icon: <Type className="w-3.5 h-3.5" /> },
            { id: 'upload', label: 'Upload', icon: <Upload className="w-3.5 h-3.5" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5 space-y-3.5">
          {/* Color Selector */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Ink Color:</span>
            <div className="flex items-center space-x-2">
              {[
                { name: 'Black', color: '#0f172a' },
                { name: 'Blue', color: '#0071e3' },
                { name: 'Red', color: '#ff3b30' },
              ].map((c) => (
                <button
                  key={c.color}
                  onClick={() => setSigColor(c.color)}
                  className={`w-5 h-5 rounded-full border transition-all ${
                    sigColor === c.color ? 'ring-2 ring-[#0071e3] scale-110' : 'border-black/15'
                  }`}
                  style={{ backgroundColor: c.color }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* DRAW TAB */}
          {tab === 'draw' && (
            <div className="space-y-2">
              <div className="relative border border-dashed border-black/15 bg-slate-50 rounded-xl overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={460}
                  height={160}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-40 cursor-crosshair touch-none"
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs font-medium">
                    Sign here with your mouse or finger
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={clearCanvas}
                  className="flex items-center space-x-1 text-xs text-slate-500 hover:text-slate-900"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          )}

          {/* TYPE TAB */}
          {tab === 'type' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Your Name</label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="w-full bg-slate-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
                  placeholder="Enter name..."
                />
              </div>

              {/* Font Choices */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'font-sig-dancing', label: 'Classic', style: 'font-sig-dancing' },
                  { id: 'font-sig-great', label: 'Formal', style: 'font-sig-great' },
                  { id: 'font-sig-pacifico', label: 'Bold', style: 'font-sig-pacifico' },
                  { id: 'font-sig-sacramento', label: 'Elegant', style: 'font-sig-sacramento' },
                ].map((f) => (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFont(f.id)}
                    className={`border rounded-xl p-3 text-center cursor-pointer transition-all ${
                      selectedFont === f.id
                        ? 'border-[#0071e3] bg-blue-50/40'
                        : 'border-black/10 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 block mb-1">{f.label}</span>
                    <span
                      className={`text-lg block truncate ${f.style}`}
                      style={{ color: sigColor }}
                    >
                      {typedName || 'Signature'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UPLOAD TAB */}
          {tab === 'upload' && (
            <div>
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                id="sig-file"
                className="hidden"
                onChange={handleUploadImage}
              />
              <label
                htmlFor="sig-file"
                className="border border-dashed border-black/15 bg-slate-50 hover:bg-slate-100 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer text-center space-y-2 block"
              >
                {uploadedImage ? (
                  <img
                    src={uploadedImage}
                    alt="Signature"
                    className="max-h-24 object-contain mx-auto"
                  />
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-xs font-medium text-slate-700">Choose signature image</span>
                    <span className="text-[10px] text-slate-400">PNG, JPG, or WebP</span>
                  </>
                )}
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-black/5 bg-slate-50 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center space-x-1 bg-[#0071e3] hover:bg-[#0077ED] text-white text-xs font-medium px-4 py-1.5 rounded-xl shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Insert Signature</span>
          </button>
        </div>
      </div>
    </div>
  );
};
