import React, { useState, useEffect } from 'react';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: () => void;
    t: (key: string) => string;
}

/* ── Interactive Phone Demo ─────────────────────────────────── */
const LABELS = ['Scan', 'Analyzing', 'Result', 'Treatment', 'Buy Kit'];

const PhoneScreen: React.FC<{ step: number; analyzeProgress: number }> = ({ step, analyzeProgress }) => {
    // Shared header bar for all screens
    const StatusBar = () => (
        <div className="flex justify-between items-center px-4 pt-2 pb-1 text-[9px] font-semibold text-gray-600">
            <span>9:41</span>
            <div className="flex gap-1 items-center">
                <span className="material-icons-round" style={{fontSize: 10}}>signal_cellular_alt</span>
                <span className="material-icons-round" style={{fontSize: 10}}>wifi</span>
                <span className="material-icons-round" style={{fontSize: 10}}>battery_full</span>
            </div>
        </div>
    );
    const AppBar = ({ title }: { title: string }) => (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <div className="w-5 h-5 bg-green-600 rounded-md flex items-center justify-center">
                <span className="material-icons-round text-white" style={{fontSize: 12}}>eco</span>
            </div>
            <span className="text-[11px] font-extrabold text-gray-900 tracking-tight">{title}</span>
            <div className="ml-auto flex gap-1.5">
                <span className="material-icons-round text-gray-400" style={{fontSize: 14}}>notifications_none</span>
                <span className="material-icons-round text-gray-400" style={{fontSize: 14}}>settings</span>
            </div>
        </div>
    );

    if (step === 0) return (
        <div className="h-full flex flex-col bg-gray-900">
            <StatusBar />
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                {/* Simulated camera viewfinder */}
                <div className="absolute inset-0 bg-gradient-to-b from-green-900/40 to-green-950/60" />
                <img src="https://images.unsplash.com/photo-1605000797499-95a51c5269ae?q=60&w=400&h=600&fit=crop" className="absolute inset-0 w-full h-full object-cover opacity-60" alt="" />
                {/* Scan frame */}
                <div className="relative w-48 h-48 border-2 border-green-400 rounded-2xl" style={{boxShadow: '0 0 40px rgba(34,197,94,0.15)'}}>
                    <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-[3px] border-l-[3px] border-green-400 rounded-tl-lg" />
                    <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-[3px] border-r-[3px] border-green-400 rounded-tr-lg" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-[3px] border-l-[3px] border-green-400 rounded-bl-lg" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-[3px] border-r-[3px] border-green-400 rounded-br-lg" />
                    {/* Scanning line animation */}
                    <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-[scanLine_2s_ease-in-out_infinite]" />
                </div>
                <div className="absolute bottom-16 left-0 right-0 text-center">
                    <div className="inline-flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-green-400 text-[10px] font-bold">Position leaf inside frame</span>
                    </div>
                </div>
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/90 border-[3px] border-green-400 flex items-center justify-center shadow-lg">
                        <div className="w-9 h-9 rounded-full bg-green-500" />
                    </div>
                </div>
            </div>
        </div>
    );

    if (step === 1) return (
        <div className="h-full flex flex-col bg-white">
            <StatusBar />
            <AppBar title="KropScan" />
            <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
                <div className="relative w-28 h-28">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="6" />
                        <circle cx="50" cy="50" r="42" fill="none" stroke="#22c55e" strokeWidth="6" strokeLinecap="round"
                            strokeDasharray={264} strokeDashoffset={264 - (264 * analyzeProgress / 100)}
                            className="transition-all duration-200" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="material-icons-round text-green-600 text-3xl animate-pulse">memory</span>
                    </div>
                </div>
                <div className="text-center">
                    <p className="text-sm font-bold text-gray-900">Analyzing with Edge AI...</p>
                    <p className="text-[10px] text-gray-400 mt-1">{analyzeProgress < 50 ? 'Loading ONNX model...' : analyzeProgress < 80 ? 'Running inference...' : 'Generating report...'}</p>
                </div>
                <div className="w-full max-w-[180px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-200" style={{width: `${analyzeProgress}%`}} />
                </div>
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <span className="material-icons-round text-emerald-600" style={{fontSize: 11}}>smartphone</span>
                    <span className="text-[9px] font-bold text-emerald-700">Running locally — no internet used</span>
                </div>
            </div>
        </div>
    );

    if (step === 2) return (
        <div className="h-full flex flex-col bg-[#f8faf8]">
            <StatusBar />
            <AppBar title="Diagnosis Results" />
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
                <div className="flex gap-1.5">
                    <div className="px-2 py-0.5 rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700 flex items-center gap-1">
                        <span className="material-icons-round" style={{fontSize: 9}}>memory</span>Edge AI
                    </div>
                    <div className="px-2 py-0.5 rounded-full bg-green-100 text-[8px] font-bold text-green-700 flex items-center gap-1">
                        <span className="material-icons-round" style={{fontSize: 9}}>smartphone</span>Ran locally
                    </div>
                </div>
                <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                    <div className="flex gap-3">
                        <div className="w-16 h-16 rounded-lg bg-amber-100 overflow-hidden flex-shrink-0">
                            <img src="https://images.unsplash.com/photo-1605000797499-95a51c5269ae?q=60&w=120&h=120&fit=crop" className="w-full h-full object-cover" alt="" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-extrabold text-gray-900">Brown Rust</h4>
                            <p className="text-[10px] text-gray-500">Wheat • Severity Medium</p>
                            <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex items-center gap-1">
                                    <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                                        <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                                        <circle cx="18" cy="18" r="14" fill="none" stroke="#22c55e" strokeWidth="3" strokeDasharray="88" strokeDashoffset="11" strokeLinecap="round" />
                                    </svg>
                                    <span className="text-xs font-black text-green-600">87%</span>
                                </div>
                                <span className="text-[9px] text-gray-400">Confidence</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-lg p-2.5 border border-gray-100 text-center">
                        <p className="text-[8px] text-gray-400 uppercase font-bold">Affected Area</p>
                        <p className="text-sm font-black text-gray-900">15%</p>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border border-gray-100 text-center">
                        <p className="text-[8px] text-gray-400 uppercase font-bold">Spread Risk</p>
                        <p className="text-sm font-black text-orange-500">Medium</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                    <p className="text-[8px] text-gray-400 uppercase font-bold tracking-wider mb-2">Symptoms Detected</p>
                    <div className="space-y-1.5">
                        {['Orange-brown pustules on leaves', 'Reduced grain filling'].map((s, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                                <span className="material-icons-round text-orange-500" style={{fontSize: 10, marginTop: 1}}>warning</span>
                                <span className="text-[10px] text-gray-700">{s}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    if (step === 3) return (
        <div className="h-full flex flex-col bg-[#f8faf8]">
            <StatusBar />
            <AppBar title="Treatment Plan" />
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className="material-icons-round text-red-500" style={{fontSize: 14}}>science</span>
                        <h4 className="text-xs font-extrabold text-gray-900">Chemical Control</h4>
                        <span className="ml-auto text-[8px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Fast Action</span>
                    </div>
                    {['Propiconazole 125ml/200L water', 'Tebuconazole 100g/200L water'].map((c, i) => (
                        <div key={i} className="flex items-center gap-2 py-1.5 border-t border-gray-50">
                            <span className="material-icons-round text-blue-500" style={{fontSize: 11}}>science</span>
                            <span className="text-[10px] text-gray-700 font-medium">{c}</span>
                        </div>
                    ))}
                </div>
                <div className="bg-white rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center gap-2 mb-2.5">
                        <span className="material-icons-round text-green-600" style={{fontSize: 14}}>grass</span>
                        <h4 className="text-xs font-extrabold text-gray-900">Organic Options</h4>
                    </div>
                    {['Neem oil 2ml/L', 'Garlic-chili extract spray'].map((c, i) => (
                        <div key={i} className="flex items-center gap-2 py-1.5 border-t border-gray-50">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span className="text-[10px] text-gray-700 font-medium">{c}</span>
                        </div>
                    ))}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="material-icons-round text-amber-600" style={{fontSize: 13}}>info</span>
                        <span className="text-[10px] font-bold text-amber-800">Soil Insight</span>
                    </div>
                    <p className="text-[9px] text-amber-700">Apply potash-based fertilizer to strengthen plant resistance. Estimated cost: ₹800/acre.</p>
                </div>
            </div>
        </div>
    );

    // step 4: Buy Kit
    return (
        <div className="h-full flex flex-col bg-[#f8faf8]">
            <StatusBar />
            <AppBar title="Treatment Kit" />
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-3 border border-orange-200">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="material-icons-round text-orange-600" style={{fontSize: 14}}>shopping_cart</span>
                        <h4 className="text-xs font-extrabold text-gray-900">1-Click Treatment Kit</h4>
                    </div>
                    <p className="text-[9px] text-gray-600 mb-3">Get the recommended chemicals and organic sprays delivered in 24 hours.</p>
                    <div className="flex gap-2 mb-3">
                        {['💊 Chemical', '🌿 Organic', '🛡️ Protective'].map((item, i) => (
                            <div key={i} className="flex-1 bg-white rounded-lg py-1.5 text-center text-[8px] font-bold text-gray-700 shadow-sm">{item}</div>
                        ))}
                    </div>
                    <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm">
                        <div>
                            <p className="text-[9px] text-gray-400 line-through">₹960</p>
                            <p className="text-lg font-black text-gray-900">₹800</p>
                        </div>
                        <button className="bg-orange-500 text-white px-4 py-2 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg shadow-orange-500/30">
                            Buy Kit <span className="material-icons-round" style={{fontSize: 12}}>arrow_forward</span>
                        </button>
                    </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2.5">
                    <span className="material-icons-round text-green-600" style={{fontSize: 18}}>smart_toy</span>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-gray-900">Ask KropBot</p>
                        <p className="text-[8px] text-gray-500">Have questions? Chat with our AI assistant.</p>
                    </div>
                    <button className="bg-green-600 text-white px-2.5 py-1.5 rounded-lg text-[9px] font-bold">Chat</button>
                </div>
            </div>
        </div>
    );
};

const DemoModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [step, setStep] = useState(0);
    const [analyzeProgress, setAnalyzeProgress] = useState(0);
    const [autoPlay, setAutoPlay] = useState(true);

    useEffect(() => {
        if (!autoPlay) return;
        if (step === 1) {
            // Animate progress bar for analyzing step
            const iv = setInterval(() => {
                setAnalyzeProgress(p => {
                    if (p >= 100) { clearInterval(iv); setTimeout(() => { setStep(2); setAnalyzeProgress(0); }, 400); return 100; }
                    return p + 3;
                });
            }, 60);
            return () => clearInterval(iv);
        }
        // Auto-advance for other steps
        const timeout = step === 0 ? 3000 : 4000;
        const timer = setTimeout(() => {
            if (step < 4) setStep(s => s + 1);
            else setAutoPlay(false); // Stop at last step
        }, timeout);
        return () => clearTimeout(timer);
    }, [step, autoPlay]);

    const advance = () => {
        setAutoPlay(false);
        if (step < 4) { setStep(s => s + 1); setAnalyzeProgress(0); }
    };
    const goBack = () => {
        setAutoPlay(false);
        if (step > 0) { setStep(s => s - 1); setAnalyzeProgress(0); }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
            <style>{`
                @keyframes scanLine { 0%,100% { top: 10%; } 50% { top: 85%; } }
                @keyframes phoneEntry { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
            `}</style>

            <div className="relative flex flex-col items-center gap-6" onClick={e => e.stopPropagation()} style={{animation: 'phoneEntry 0.4s ease-out'}}>
                {/* Step labels */}
                <div className="flex items-center gap-1">
                    {LABELS.map((label, i) => (
                        <React.Fragment key={i}>
                            <button onClick={() => { setStep(i); setAutoPlay(false); setAnalyzeProgress(0); }}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${i === step ? 'bg-white text-gray-900 shadow-lg' : 'text-white/40 hover:text-white/70'}`}>
                                {label}
                            </button>
                            {i < 4 && <span className="material-icons-round text-white/20" style={{fontSize: 10}}>chevron_right</span>}
                        </React.Fragment>
                    ))}
                </div>

                {/* Phone Frame — iPhone 17 Pro style */}
                <div className="relative cursor-pointer" onClick={advance}>
                    <div className="w-[260px] h-[540px] bg-[#1a1a1a] rounded-[40px] p-[5px] shadow-2xl shadow-black/60 ring-1 ring-white/[0.08]" style={{boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)'}}>
                        {/* Side button accents */}
                        <div className="absolute -right-[2px] top-[120px] w-[3px] h-[28px] bg-[#2a2a2a] rounded-r-sm" />
                        <div className="absolute -left-[2px] top-[100px] w-[3px] h-[20px] bg-[#2a2a2a] rounded-l-sm" />
                        <div className="absolute -left-[2px] top-[140px] w-[3px] h-[36px] bg-[#2a2a2a] rounded-l-sm" />
                        <div className="absolute -left-[2px] top-[184px] w-[3px] h-[36px] bg-[#2a2a2a] rounded-l-sm" />
                        <div className="w-full h-full rounded-[35px] overflow-hidden bg-white relative">
                            {/* Dynamic Island */}
                            <div className="absolute top-[6px] left-1/2 -translate-x-1/2 z-50 flex items-center">
                                <div className="w-[76px] h-[22px] bg-black rounded-full flex items-center justify-center gap-2 shadow-inner">
                                    <div className="w-[8px] h-[8px] rounded-full bg-[#1a1a2e] ring-1 ring-[#2a2a3e]" />
                                    <div className="w-[4px] h-[4px] rounded-full bg-[#0a0a1a]" />
                                </div>
                            </div>
                            <PhoneScreen step={step} analyzeProgress={analyzeProgress} />
                        </div>
                    </div>
                    {/* Reflection */}
                    <div className="absolute inset-0 rounded-[36px] bg-gradient-to-br from-white/[0.08] to-transparent pointer-events-none" />
                </div>

                {/* Caption + Nav */}
                <div className="flex items-center gap-4">
                    <button onClick={goBack} disabled={step === 0}
                        className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors disabled:opacity-20">
                        <span className="material-icons-round text-white text-lg">arrow_back</span>
                    </button>
                    <div className="text-center min-w-[140px]">
                        <p className="text-white font-bold text-sm">{LABELS[step]}</p>
                        <p className="text-white/40 text-[10px]">Tap phone or arrows to navigate</p>
                    </div>
                    <button onClick={advance} disabled={step === 4}
                        className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-400 transition-colors disabled:opacity-20 shadow-lg shadow-green-500/30">
                        <span className="material-icons-round text-white text-lg">arrow_forward</span>
                    </button>
                </div>

                {/* CTA */}
                <button onClick={onClose} className="bg-white text-gray-900 px-8 py-3 rounded-full font-bold text-sm hover:bg-gray-100 transition-colors shadow-xl">
                    Try It Yourself
                </button>
            </div>
        </div>
    );
};

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, t }) => {
    const [scrolled, setScrolled] = useState(false);
    const [showDemo, setShowDemo] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const techStack = [
        { name: "Google Gemini", icon: "auto_awesome" },
        { name: "ONNX Runtime", icon: "memory" },
        { name: "Firebase", icon: "cloud" },
        { name: "React", icon: "code" },
        { name: "TensorFlow", icon: "psychology" },
    ];

    return (
        <div className="min-h-screen bg-[#FDFDFD] text-gray-900 font-sans selection:bg-green-500 selection:text-white overflow-x-hidden">
            {showDemo && <DemoModal onClose={() => { setShowDemo(false); onGetStarted(); }} />}
            {/* Custom Animations Style Block */}
            <style>{`
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-15px); }
                    100% { transform: translateY(0px); }
                }
                .animate-float { animation: float 6s ease-in-out infinite; }
                .animate-float-delayed { animation: float 6s ease-in-out 3s infinite; }
                
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up { animation: fade-in-up 0.8s ease-out forwards; }
                
                .glass-nav {
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(12px);
                    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                }
                
                .hero-glow {
                    background: radial-gradient(circle at center, rgba(34, 197, 94, 0.08) 0%, transparent 70%);
                }
            `}</style>

            {/* Navbar */}
            <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'glass-nav py-4 shadow-sm' : 'bg-transparent py-8'}`}>
                <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
                    <div className="flex items-center gap-2 group cursor-pointer">
                        <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20 group-hover:scale-110 transition-transform">
                            <span className="material-icons-round text-white text-xl">eco</span>
                        </div>
                        <span className="text-xl font-black tracking-tight text-gray-900">KropScan</span>
                    </div>

                    <div className="hidden md:flex items-center gap-8 text-sm font-bold text-gray-500">
                        {['Features', 'Marketplace', 'Community'].map((item) => (
                            <a key={item} href={`#${item.toLowerCase()}`} className="hover:text-green-600 transition-colors">{item}</a>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={onLogin} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:text-green-600 transition-colors">Log In</button>
                        <button onClick={onGetStarted} className="bg-gray-900 text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-black transition-colors shadow-lg hover:shadow-xl hover:-translate-y-0.5 transform">
                            Get Started
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-40 pb-20 lg:pt-52 lg:pb-32 px-6">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl hero-glow pointer-events-none -z-10"></div>

                <div className="max-w-5xl mx-auto text-center space-y-8">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-100 text-xs font-bold text-green-700 mb-4 animate-fade-in-up shadow-sm">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                        </span>
                        Hybrid Edge-AI · Built for North-East India
                    </div>

                    <h1 className="text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[1.05] text-gray-900 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                        Precision Farming <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-500">for the NER farmer.</span>
                    </h1>

                    <p className="text-xl md:text-2xl text-gray-500 max-w-2xl mx-auto leading-relaxed animate-fade-in-up font-medium" style={{ animationDelay: '0.2s' }}>
                        Offline-first crop disease diagnosis covering NER specialty crops — areca nut, large cardamom, king chilli, Khasi mandarin. Plus jhum rotation advisory and ASHA-worker outbreak surveillance.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                        <button onClick={onGetStarted} className="w-full sm:w-auto h-16 px-10 bg-green-600 hover:bg-green-700 text-white rounded-full font-bold text-lg transition-all flex items-center justify-center gap-2 group shadow-xl shadow-green-600/20 hover:-translate-y-1">
                            <span className="material-icons-round group-hover:rotate-12 transition-transform">qr_code_scanner</span>
                            Start Scanning
                        </button>
                        <button onClick={() => setShowDemo(true)} className="w-full sm:w-auto h-16 px-10 bg-white hover:bg-gray-50 text-gray-900 rounded-full font-bold text-lg border border-gray-200 transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md">
                            <span className="material-icons-round text-green-600">play_circle</span>
                            Watch Demo
                        </button>
                    </div>
                </div>

                {/* Dashboard Preview Imagery */}
                <div className="mt-24 relative max-w-6xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
                    <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-gray-200 border border-gray-100 bg-white aspect-[16/9] group">
                        {/* Mock UI using Image */}
                        <img src="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=2000&auto=format&fit=crop" alt="Dashboard Preview" className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-[2s]" />

                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/50 via-transparent to-transparent"></div>

                        {/* Overlay UI Mockups */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-white/90 backdrop-blur-xl p-8 rounded-[2rem] border border-white/50 shadow-2xl max-w-md text-center transform group-hover:scale-105 transition-transform duration-500">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <span className="material-icons-round text-5xl text-green-600">check_circle</span>
                                </div>
                                <h3 className="text-3xl font-black text-gray-900 mb-2">Crop Healthy</h3>
                                <p className="text-gray-500 font-medium">Your wheat crop is showing 98% health index with optimal nitrogen levels.</p>
                            </div>
                        </div>

                        {/* Floating Cards */}
                        <div className="absolute top-12 right-12 bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-white/50 shadow-xl flex items-center gap-4 animate-float">
                            <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center">
                                <span className="material-icons-round">warning</span>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Alert</p>
                                <p className="text-base font-bold text-gray-900">Pest Detected</p>
                            </div>
                        </div>

                        <div className="absolute bottom-12 left-12 bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-white/50 shadow-xl flex items-center gap-4 animate-float-delayed">
                            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                                <span className="material-icons-round">trending_up</span>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Market</p>
                                <p className="text-base font-bold text-gray-900">Soybean +8.4%</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tech Stack Strip */}
            <div className="border-y border-gray-100 bg-gray-50/50 py-10 overflow-hidden">
                <div className="max-w-7xl mx-auto px-6">
                    <p className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest mb-8">Powered By</p>
                    <div className="flex justify-center gap-10 md:gap-16 flex-wrap items-center">
                        {techStack.map((t, i) => (
                            <div key={i} className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors">
                                <span className="material-icons-round text-xl">{t.icon}</span>
                                <span className="text-sm font-bold tracking-wide">{t.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bento Grid */}
            <section id="features" className="py-32 px-6 bg-white">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-20">
                        <h2 className="text-4xl md:text-6xl font-black mb-6 text-gray-900">Everything you need <br /> <span className="text-gray-400">to grow better.</span></h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Row 1: Instant Diagnosis (2 cols) + Market Intel (1 col) */}
                        <div className="md:col-span-2 bg-gradient-to-br from-green-600 to-green-800 rounded-3xl p-10 md:p-12 relative overflow-hidden group hover:shadow-2xl hover:shadow-green-900/20 transition-all duration-500">
                            <div className="relative z-10">
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 text-white/90 text-xs font-bold mb-6 backdrop-blur-sm">
                                    <span className="material-icons-round text-sm">offline_bolt</span>
                                    Works Offline
                                </div>
                                <h3 className="text-3xl md:text-4xl font-black mb-4 text-white">Instant Diagnosis</h3>
                                <p className="text-white/80 text-lg leading-relaxed font-medium max-w-lg">
                                    Snap a photo. Get a diagnosis in 2 seconds. Hybrid edge + cloud AI covers 60+ diseases across 25+ crops, including NER specialty crops the model hasn't seen before.
                                </p>
                                <div className="flex gap-3 mt-8">
                                    {['60+ Diseases', '25+ Crops', 'NER Specialty'].map((stat, i) => (
                                        <div key={i} className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm font-bold backdrop-blur-sm">{stat}</div>
                                    ))}
                                </div>
                            </div>
                            <div className="absolute right-[-5%] bottom-[-10%] w-56 h-56 bg-white/5 rounded-full blur-2xl"></div>
                            <span className="material-icons-round text-[10rem] text-white/[0.04] absolute right-4 top-4">center_focus_strong</span>
                        </div>

                        <div id="marketplace" className="bg-white rounded-3xl p-8 md:p-10 border border-gray-100 shadow-lg shadow-gray-100/50 flex flex-col justify-between group hover:border-green-200 transition-all">
                            <div>
                                <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center mb-6">
                                    <span className="material-icons-round text-green-600 text-2xl">insights</span>
                                </div>
                                <h3 className="text-2xl font-black mb-2 text-gray-900">Market Intel</h3>
                                <p className="text-gray-500 font-medium text-sm">Live mandi prices from your district. AI-powered buy/sell signals.</p>
                            </div>
                            <div className="h-32 mt-6 flex items-end gap-2">
                                {[35, 55, 40, 65, 80, 60, 85, 70, 92].map((h, i) => (
                                    <div key={i} style={{ height: `${h}%` }} className={`flex-1 rounded-t-md transition-all duration-500 origin-bottom group-hover:scale-y-105 ${i >= 7 ? 'bg-green-500' : 'bg-gray-200 group-hover:bg-green-200'}`}></div>
                                ))}
                            </div>
                        </div>

                        {/* Row 2: Community (1 col) + CTA (2 cols) */}
                        <div id="community" className="bg-gray-900 rounded-3xl p-8 md:p-10 relative overflow-hidden group hover:shadow-2xl transition-all">
                            <div className="relative z-10 h-full flex flex-col justify-between">
                                <div>
                                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6">
                                        <span className="material-icons-round text-green-400 text-2xl">forum</span>
                                    </div>
                                    <h3 className="text-2xl font-black mb-2 text-white">Community</h3>
                                    <p className="text-gray-400 font-medium text-sm">Share knowledge, trade produce, get expert advice from real farmers.</p>
                                </div>
                                <div className="mt-8">
                                    <div className="flex -space-x-2 mb-3">
                                        {[1, 2, 3, 4, 5].map((i) => (
                                            <div key={i} className="w-9 h-9 rounded-full border-2 border-gray-900 bg-gray-700 overflow-hidden">
                                                <img src={`https://i.pravatar.cc/80?u=${i + 30}`} alt="User" className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                        <div className="w-9 h-9 rounded-full border-2 border-gray-900 bg-green-600 flex items-center justify-center text-white text-[10px] font-bold">+5k</div>
                                    </div>
                                    <p className="text-gray-500 text-xs font-medium">Active farmers near you</p>
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-2 bg-gradient-to-r from-gray-50 to-green-50 rounded-3xl p-10 md:p-12 relative overflow-hidden group border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-8">
                            <div className="max-w-md">
                                <h3 className="text-3xl md:text-4xl font-black mb-4 text-gray-900">Start Scanning Today</h3>
                                <p className="text-gray-500 text-lg font-medium mb-8">
                                    Protect your crops with AI. Free for every farmer in India.
                                </p>
                                <button onClick={onGetStarted} className="bg-green-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-600/25 hover:shadow-green-600/40 hover:-translate-y-0.5 transition-all">
                                    Try for Free
                                </button>
                            </div>
                            <div className="flex gap-4 text-center">
                                {[
                                    { icon: 'photo_camera', label: 'Scan', sub: 'Take a photo' },
                                    { icon: 'psychology', label: 'Diagnose', sub: 'AI identifies' },
                                    { icon: 'medical_services', label: 'Treat', sub: 'Get solutions' },
                                ].map((step, i) => (
                                    <div key={i} className="flex flex-col items-center gap-2">
                                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-gray-100">
                                            <span className="material-icons-round text-green-600 text-xl">{step.icon}</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900">{step.label}</span>
                                        <span className="text-xs text-gray-400">{step.sub}</span>
                                        {i < 2 && <span className="material-icons-round text-gray-300 text-sm absolute hidden md:block" style={{marginLeft: '80px'}}>arrow_forward</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="py-24 border-t border-gray-100 bg-gray-50/50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid md:grid-cols-3 gap-12">
                        {[
                            { id: "01", title: "Scan Crop", desc: "Take a clear photo of the affected area." },
                            { id: "02", title: "AI Analysis", desc: "Our model identifies the disease in seconds." },
                            { id: "03", title: "Get Solution", desc: "Receive organic & chemical treatment plans." },
                        ].map((step) => (
                            <div key={step.id} className="relative pl-8 py-4 group">
                                <span className="text-9xl font-black text-gray-200/50 absolute -top-10 -left-4 -z-10 group-hover:text-green-500/10 transition-colors duration-500 select-none">{step.id}</span>
                                <h3 className="text-3xl font-bold mb-3 text-gray-900">{step.title}</h3>
                                <p className="text-gray-500 text-lg leading-relaxed">{step.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-gray-100 text-center bg-white">
                <div className="flex justify-center items-center gap-2 mb-4 opacity-50">
                    <span className="material-icons-round text-gray-400">eco</span>
                    <span className="font-bold text-gray-500">KropScan</span>
                </div>
                <p className="text-gray-400 text-sm font-medium">© 2026 KropScan Technologies. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default LandingPage;