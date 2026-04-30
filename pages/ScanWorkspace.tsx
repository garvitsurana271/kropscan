import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { classifierService, PredictionResult } from '../services/ClassifierService';
import { subscriptionService } from '../services/SubscriptionService';
import UpgradeModal from '../components/UpgradeModal';
import QualityErrorModal from '../components/QualityErrorModal';
import AnalysisFailedModal from '../components/AnalysisFailedModal';
import { toast } from 'sonner';

const ScanWorkspace: React.FC<{
  onResult: (result: PredictionResult) => void,
  t: (key: string) => string,
  user?: any,
  language?: string,
  onUserUpdate?: (user: any) => void
}> = ({ onResult, t, user, language = 'English', onUserUpdate }) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const pendingResult = useRef<PredictionResult | null>(null);

  // GPay-style chime — three ascending tones, clean and satisfying
  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const play = (freq: number, start: number, dur: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      play(523, 0, 0.15, 0.10);      // C5
      play(659, 0.12, 0.15, 0.12);   // E5
      play(784, 0.24, 0.35, 0.10);   // G5 — lingers
    } catch { /* silent fail */ }
  };



  const [analyzing, setAnalyzing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Quality Error State
  // Quality & Analysis Error State
  const [qualityError, setQualityError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Prefer back camera on mobile
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(t("Camera Error"));
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
            stopCamera();
            handleUpload(file);
          }
        }, 'image/jpeg');
      }
    }
  };

  useEffect(() => {
    return () => {
      stopCamera(); // Cleanup on unmount
    };
  }, []);

  // Handle Global Paste (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!analyzing && !isCameraOpen && e.clipboardData && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          handleUpload(file);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [analyzing, isCameraOpen, user]); // Dependencies trigger re-bind, which is fine

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  const handleUpload = async (file?: File) => {
    // Check Limits
    // Mock user for now if context not available, ideally passed as prop
    // Check limits using real user prop
    // Use fallback if user not fully loaded yet (though App.tsx handles login state)
    const currentUser = user || { role: 'USER', plan: 'Free' };

    // Check if limits exceeded
    const limitCheck = subscriptionService.checkLimit(currentUser, 'scans');
    if (!limitCheck.allowed) {
      // Trigger Upgrade Modal (we'll need a state for this)
      setShowUpgradeModal(true);
      return;
    }

    if (!file) {
      document.getElementById('file-upload-input')?.click();
      return;
    }

    setAnalyzing(true);
    setQualityError(null); // Clear previous errors

    try {
      const img = document.createElement('img');
      const reader = new FileReader();

      reader.onload = async (e) => {
        img.onload = async () => {
          try {
            if (import.meta.env.DEV) console.log(`Starting classification (${language})...`);
            const result = await classifierService.classifyImage(img, language);

            // Increment Usage only on success
            subscriptionService.incrementUsage('scans', currentUser);

            if (import.meta.env.DEV) console.log("Classification result:", result);

            // Inject the captured image so it shows up in the results page instead of the placeholder
            if (e.target?.result) {
              result.disease.image = e.target.result as string;
            }

            setAnalyzing(false);
            // Success moment — brief green pulse + chime before showing result
            pendingResult.current = result;
            setShowSuccess(true);
            playChime();
            // Haptic feedback — two pulses like GPay
            if (navigator.vibrate) navigator.vibrate([50, 80, 50]);
            setTimeout(() => {
              setShowSuccess(false);
              onResult(result);
            }, 1500);
          } catch (error: any) {
            console.error("Classification failed", error);
            setAnalyzing(false);

            // Handle specific errors
            const msg = error.message || t("Analyze Failed");

            if (msg.includes("Not a Plant") || msg === "Not a Plant") {
              setAnalysisError("Not a Plant");
            } else if (msg.includes("too blurry") || msg.includes("too dark") || msg.includes("resolution")) {
              setQualityError(msg);
            } else {
              setAnalysisError(msg);
            }
          }
        };

        img.onerror = () => {
            console.error("Failed to load image for scanning.");
            setAnalyzing(false);
            setAnalysisError("Invalid image format or corrupted file.");
        };

        img.src = e.target?.result as string;
      };
      
      reader.onerror = () => {
          console.error("FileReader failed.");
          setAnalyzing(false);
          setAnalysisError("Failed to read image file.");
      };

      reader.readAsDataURL(file);

    } catch (err) {
      console.error(err);
      setAnalyzing(false);
      setAnalysisError("An unexpected error occurred during upload.");
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-10 max-w-5xl mx-auto flex flex-col animate-fade-in w-full relative">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(circle,rgba(61,111,57,0.06)_0%,transparent_70%)] pointer-events-none -z-10"></div>
      <div className="mb-5 md:mb-8 flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mb-1 md:mb-2">{t('New Diagnosis')}</h1>
          <p className="text-gray-500 dark:text-gray-400">{t('Upload a leaf sample')}</p>
        </div>
        <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full border border-primary/20 shadow-lg shadow-primary/10">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-primary">{t('Hybrid Edge-AI Active')}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-surface-dark rounded-2xl md:rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-800 p-3 md:p-8 flex flex-col items-center justify-center relative overflow-hidden min-h-[400px] md:min-h-[600px]">

        {/* Camera Modal Overlay — fullscreen so capture button is always visible */}
        {isCameraOpen && (
          <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
            <div className="relative flex-1 bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              
              {/* Mock AR Scanning Grid Overlay */}
              <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden portrait:hidden landscape:block sm:portrait:block">
                {/* Crosshairs */}
                <div className="absolute inset-x-0 h-[1px] bg-primary/40 top-1/2 -translate-y-1/2"></div>
                <div className="absolute inset-y-0 w-[1px] bg-primary/40 left-1/2 -translate-x-1/2"></div>
                
                {/* Focus Box */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-primary/60 rounded-3xl grid grid-cols-4 grid-rows-4">
                  {Array.from({length: 16}).map((_, i) => (
                    <div key={i} className="border-[0.5px] border-primary/20"></div>
                  ))}
                  {/* Corner Accents */}
                  <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-3xl"></div>
                  <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-3xl"></div>
                  <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-3xl"></div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-3xl"></div>
                  
                  {/* Scanning Laser Line */}
                  <div className="absolute left-0 right-0 top-0 h-1 bg-primary/80 shadow-[0_0_15px_rgba(61,111,57,1)] animate-scan-laser"></div>
                </div>
                
                {/* Clean Camera HUD */}
                <div className="absolute top-6 left-6 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <span className="text-white/90 text-xs font-bold tracking-wide">{t('AI Ready')}</span>
                </div>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md px-6 py-2 rounded-full">
                  <span className="text-white/90 text-sm font-medium">{t('Position leaf inside the frame')}</span>
                </div>
              </div>
            </div>
            {/* Liquid glass control bar */}
            <div className="h-36 bg-black/30 backdrop-blur-2xl border-t border-white/10 flex items-center justify-center gap-10 relative z-50">
              <button
                onClick={stopCamera}
                className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/25 active:scale-90 transition-all shadow-lg shadow-black/20"
              >
                <span className="material-icons-round text-2xl">close</span>
              </button>
              <button
                onClick={captureImage}
                className="w-[76px] h-[76px] rounded-full border-[3px] border-white/90 flex items-center justify-center relative group shadow-xl shadow-black/30"
              >
                <div className="w-[62px] h-[62px] bg-white rounded-full group-hover:scale-90 group-active:scale-75 transition-transform shadow-inner"></div>
              </button>
              <button
                className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/25 active:scale-90 transition-all shadow-lg shadow-black/20"
              >
                <span className="material-icons-round text-2xl">cameraswitch</span>
              </button>
            </div>
          </div>
        )}

        {/* GPay-style fullscreen success moment */}
        {showSuccess && ReactDOM.createPortal(
          <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center" style={{background: 'linear-gradient(135deg, #166534 0%, #15803d 40%, #22c55e 100%)'}}>
            {/* Particle burst — pre-calculated positions for browser compat */}
            {[
              [0,-110],[55,-95],[95,-55],[110,0],[95,55],[55,95],[0,110],[-55,95],[-95,55],[-110,0],[-95,-55],[-55,-95]
            ].map(([x,y], i) => (
              <div key={i} className="absolute w-2.5 h-2.5 rounded-full bg-white/70" style={{
                top: '50%', left: '50%',
                opacity: 0,
                animation: `p${i} 0.7s ${i * 0.02}s ease-out forwards`,
              }} />
            ))}

            {/* Expanding rings */}
            <div className="absolute w-36 h-36 rounded-full border-2 border-white/40" style={{animation: 'ks-ring 0.9s ease-out forwards'}} />
            <div className="absolute w-36 h-36 rounded-full border border-white/20" style={{animation: 'ks-ring 0.9s 0.12s ease-out forwards'}} />

            {/* Checkmark circle */}
            <div style={{animation: 'ks-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards', opacity: 0}}>
              <div className="w-32 h-32 rounded-full bg-white flex items-center justify-center shadow-2xl" style={{boxShadow: '0 0 60px rgba(255,255,255,0.3)'}}>
                <span className="material-icons-round text-green-600" style={{fontSize: '64px'}}>check</span>
              </div>
            </div>

            {/* Text */}
            <h2 className="text-white text-2xl font-black mt-8" style={{animation: 'ks-up 0.4s 0.3s both', opacity: 0}}>{t('Diagnosis Complete')}</h2>
            <p className="text-white/60 text-base mt-2 font-medium" style={{animation: 'ks-up 0.4s 0.45s both', opacity: 0}}>{pendingResult.current?.disease?.name || ''}</p>

            <style>{`
              @keyframes ks-pop { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.12);opacity:1} 100%{transform:scale(1);opacity:1} }
              @keyframes ks-ring { 0%{transform:scale(0.3);opacity:0.7} 100%{transform:scale(3.5);opacity:0} }
              @keyframes ks-up { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
              ${[
                [0,-110],[55,-95],[95,-55],[110,0],[95,55],[55,95],[0,110],[-55,95],[-95,55],[-110,0],[-95,-55],[-55,-95]
              ].map(([x,y], i) => `@keyframes p${i}{0%{transform:translate(0,0)scale(1);opacity:1}100%{transform:translate(${x}px,${y}px)scale(0);opacity:0}}`).join('\n')}
            `}</style>
          </div>,
          document.body
        )}

        {analyzing ? (
          <div className="w-full max-w-lg text-center z-10 px-2 md:px-4">
            {/* Cinematic AI Analysis */}
            <div className="relative w-36 h-36 md:w-48 md:h-48 mx-auto mb-6 md:mb-8">
              {/* Outer glow */}
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-3xl scale-[2] animate-pulse"></div>
              {/* Ring 1 — slow */}
              <div className="absolute inset-0 rounded-full border-2 border-primary/15" style={{ animation: 'pulse 3s ease-in-out infinite' }}></div>
              {/* Ring 2 — spinning */}
              <div className="absolute inset-3 rounded-full border-2 border-primary/30 border-t-transparent animate-spin" style={{ animationDuration: '2.5s' }}></div>
              {/* Ring 3 — counter-spin */}
              <div className="absolute inset-6 rounded-full border-2 border-primary/50 border-b-transparent animate-spin" style={{ animationDuration: '1.8s', animationDirection: 'reverse' }}></div>
              {/* Ring 4 — fast inner */}
              <div className="absolute inset-9 rounded-full border border-primary/60 border-l-transparent animate-spin" style={{ animationDuration: '1s' }}></div>
              {/* Center icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-xl shadow-green-500/30">
                  <span className="material-icons-round text-4xl text-white">eco</span>
                </div>
              </div>
            </div>

            <h3 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white mb-1">{t('Analyzing Leaf Structure')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{t('Identifying crop type')}</p>

            {/* Running locally badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{t('Running locally on your device')}</span>
            </div>

            {/* Progress steps with staggered reveal */}
            <div className="space-y-3 max-w-xs mx-auto text-left">
              {[
                { label: t('Image Uploaded'), icon: 'check_circle', done: true, delay: '0s' },
                { label: t('Running Hybrid Edge Inference'), icon: 'memory', active: true, delay: '0.3s' },
                { label: t('Generating Report'), icon: 'description', delay: '0.6s' },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 opacity-0 animate-fade-in" style={{ animationDelay: step.delay, animationFillMode: 'forwards' }}>
                  {step.done ? (
                    <span className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-500/30">
                      <span className="material-icons-round text-sm">check</span>
                    </span>
                  ) : step.active ? (
                    <span className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                      <span className="material-icons-round text-sm text-primary animate-pulse">{step.icon}</span>
                    </span>
                  ) : (
                    <span className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                      <span className="material-icons-round text-sm text-gray-300 dark:text-gray-600">{step.icon}</span>
                    </span>
                  )}
                  <span className={`text-sm font-semibold ${step.done ? 'text-green-600' : step.active ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center z-10" onDragEnter={handleDrag}>
            {dragActive && <div className="absolute inset-0 bg-primary/10 border-4 border-primary border-dashed rounded-[2.5rem] z-20 pointer-events-none transition-all" />}

            <div
              className="w-full max-w-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark rounded-2xl md:rounded-[2rem] p-6 md:p-12 text-center cursor-pointer transition-all group relative overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/30"
              onClick={() => handleUpload()}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="absolute inset-0 bg-primary/5 scale-0 group-hover:scale-100 rounded-[2rem] transition-transform duration-500 origin-center"></div>
              <div className="relative z-10">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-primary/10 to-green-50 dark:from-primary/20 dark:to-green-900/20 rounded-full shadow-inner flex items-center justify-center mx-auto mb-4 md:mb-6 group-hover:scale-110 transition-transform duration-500">
                  <span className="material-icons-round text-4xl md:text-5xl text-primary">cloud_upload</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('Click to upload')}</h3>
                <p className="text-gray-500 mb-6 md:mb-8 max-w-md mx-auto text-sm md:text-base">{t('Drag & drop or Paste (Ctrl+V) an image')}</p>
                <button className="py-3 md:py-3.5 px-8 md:px-10 bg-primary text-white rounded-full font-bold shadow-xl shadow-primary/20 hover:bg-[#345f30] hover:-translate-y-0.5 transition-all w-full md:w-auto">{t('Select File')}</button>
              </div>
            </div>

            <div className="mt-8 md:mt-12 flex items-center gap-4 w-full max-w-md">
              <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
              <span className="text-xs uppercase text-gray-400 font-bold tracking-widest">{t('Or Use Camera')}</span>
              <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                startCamera();
              }}
              className="mt-5 md:mt-8 py-3.5 md:py-4 px-8 md:px-12 flex items-center justify-center gap-3 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-surface-dark hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold transition-all hover:shadow-lg group w-full md:w-auto"
            >
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full group-hover:bg-primary group-hover:text-white transition-colors">
                <span className="material-icons-round">photo_camera</span>
              </div>
              {t('Open Camera')}
            </button>

            {cameraError && (
              <div className="mt-4 text-red-500 text-sm font-bold bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">
                {cameraError}
              </div>
            )}

            {/* Hidden Inputs */}
            <input
              type="file"
              id="file-upload-input"
              accept="image/*"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          user={user}
          onUpgrade={(updatedUser) => {
            setShowUpgradeModal(false);
            if (onUserUpdate) onUserUpdate(updatedUser);
            if (t) toast.success(t("Upgrade Successful! Welcome to Pro."));
          }}
        />
      )}

      <QualityErrorModal
        isOpen={!!qualityError}
        error={qualityError || "Unknown Issue"}
        onClose={() => setQualityError(null)}
        onRetry={() => {
          setQualityError(null);
          startCamera();
        }}
      />

      {/* Analysis Failed / Not a Plant Modal */}
      <AnalysisFailedModal
        isOpen={!!analysisError}
        error={analysisError || ""}
        onClose={() => setAnalysisError(null)}
        onRetry={() => {
          setAnalysisError(null);
          // Optional: reset camera or just close
        }}
      />
    </div>
  );
};

export default ScanWorkspace;