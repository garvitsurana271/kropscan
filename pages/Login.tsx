import React, { useState } from 'react';
import { UserRole } from '../types';
import { dbService, User } from '../services/DatabaseService';
import { firebaseService } from '../services/FirebaseService';

interface LoginProps {
  onLogin: (role: UserRole, user: User) => void;
}

const Login: React.FC<LoginProps & { t: (key: string) => string }> = ({ onLogin, t }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('USER');
  const [isLogin, setIsLogin] = useState(true);

  // Auth State
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    return () => {
      firebaseService.clearRecaptcha();
    };
  }, []);

  const handleGetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mobile.length !== 10) {
      setError(t('Enter Mobile') || 'Please enter a valid 10-digit mobile number');
      setLoading(false);
      return;
    }

    if (selectedRole === 'ADMIN' && accessCode !== 'KROP2026') {
      setError("Invalid Admin Access Code");
      setLoading(false);
      return;
    }

    try {
      firebaseService.setupRecaptcha('recaptcha-container');
    } catch (e: any) {
      console.error("Recaptcha init failed:", e);
      setError("Failed to initialize security check. Please reload.");
      setLoading(false);
      return;
    }

    const fullMobile = `+91${mobile}`;

    try {
      if (import.meta.env.DEV) console.log("Attempting Firebase Phone Auth...");
      await firebaseService.setAuthPersistence(rememberMe);
      const result = await firebaseService.loginWithPhone(fullMobile);

      if (result.success) {
        setShowOtp(true);
      } else {
        if (import.meta.env.DEV) console.warn("Firebase Auth failed, falling back to local simulation:", result.message);
        const localResult = await dbService.loginUserWithMobile(mobile);
        if (localResult.success) {
          setShowOtp(true);
          if (import.meta.env.DEV && localResult.otp) console.log(`[DEV] Demo OTP: ${localResult.otp}`);
        } else {
          const otp = await dbService.generateOtp(mobile);
          setShowOtp(true);
          if (import.meta.env.DEV) console.log(`[DEV] Registration OTP: ${otp}`);
        }
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      setError(err?.message || 'Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let user: any = null;

      if (firebaseService.confirmationResult) {
        const overrides = !isLogin ? { name, role: selectedRole } : undefined;
        const result = await firebaseService.verifyPhoneOtp(otp, overrides);

        if (result.success && result.user) {
          const fbUser = result.user;
          if (!isLogin && name) {
            if (import.meta.env.DEV) console.log("Registering new user with name:", name);
            await firebaseService.updateUser(fbUser.uid, { name: name, role: selectedRole });
            try {
              const { updateProfile } = await import('firebase/auth');
              await updateProfile(fbUser, { displayName: name });
            } catch (e) { if (import.meta.env.DEV) console.warn("Auth Profile update failed", e); }
          }
          user = { _firebaseHandled: true };
        } else {
          throw new Error("Invalid OTP (Firebase)");
        }
      } else {
        const localResult = await dbService.verifyOtp(mobile, otp);
        if (!localResult.success) {
          setError(localResult.message || 'Invalid OTP');
          setLoading(false);
          return;
        }
        user = localResult.user;

        if (!user && !isLogin) {
          const regResult = await dbService.registerUser(name, mobile, '', selectedRole);
          user = regResult.user;
        }

        if (user) {
          if (import.meta.env.DEV) console.log("Syncing Demo User to Cloud...", user.role);
          await firebaseService.syncLocalUserToCloud(user.mobile || mobile, user.name, user.role || selectedRole);
        }
      }

      if (user && !user._firebaseHandled) {
        onLogin(selectedRole, user);
      } else if (!user) {
        setError("User not found or verification failed.");
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Verification Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark flex flex-col">

      {/* ═══ DESKTOP: side-by-side layout (unchanged) ═══ */}
      <div className="hidden md:flex items-center justify-center flex-1 p-4">
        <main className="w-full max-w-[1200px] min-h-[700px] bg-surface-light dark:bg-surface-dark rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-row relative">
          <div className="w-1/2 relative bg-primary">
            <img alt="Farmer" className="absolute inset-0 w-full h-full object-cover opacity-90 mix-blend-overlay" src="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=1000&auto=format&fit=crop" />
            <div className="absolute inset-0 bg-gradient-to-b from-primary/40 to-black/60"></div>
            <div className="relative z-10 flex flex-col justify-between p-12 h-full text-white">
              <div className="flex items-center gap-3">
                <span className="material-icons-round text-3xl">eco</span>
                <span className="text-2xl font-bold tracking-tight">KropScan</span>
              </div>
              <div className="space-y-6">
                <h1 className="text-5xl font-extrabold leading-tight">Empowering Every Farmer.</h1>
                <p className="text-lg text-white/80">AI-powered crop diagnosis, treatment plans, and market intelligence — offline-first.</p>
              </div>
              <p className="text-xs text-white/60">© 2026 KropScan Technologies. All rights reserved.</p>
            </div>
          </div>

          <div className="w-1/2 p-16 flex flex-col justify-center">
            <div className="mb-10 text-left">
              <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-2">
                {isLogin ? t('Welcome Back') : t('Create Account')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                {isLogin ? 'Login with your mobile number.' : 'Join the community today.'}
              </p>
            </div>

            {/* Role selector removed — admin login via access code only */}

            <form className="space-y-5" onSubmit={showOtp ? handleVerify : handleGetOtp}>
              {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">{error}</div>}
              {!isLogin && !showOtp && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">{t('Full Name')}</label>
                  <input required className="w-full px-6 py-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all outline-none" type="text" placeholder="Rahul Singh" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">{t('Mobile Number')}</label>
                <div className="relative">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 font-bold text-gray-500">+91</span>
                  <input required disabled={showOtp} className="w-full pl-16 pr-6 py-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all outline-none font-bold tracking-widest" type="tel" maxLength={10} placeholder="Enter mobile number" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
                  {showOtp && <button type="button" onClick={() => setShowOtp(false)} className="absolute right-4 top-1/2 -translate-y-1/2 text-primary font-bold text-xs hover:underline">CHANGE</button>}
                </div>
              </div>
              {selectedRole === 'ADMIN' && !showOtp && (
                <div className="space-y-2 animate-fade-in">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Admin Access Code</label>
                  <input required className="w-full px-6 py-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all outline-none" type="password" placeholder="Enter Code" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} />
                </div>
              )}
              {showOtp && (
                <div className="space-y-2 animate-fade-in">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">{t('Enter OTP')}</label>
                  <input required className="w-full px-6 py-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all outline-none text-center font-bold text-xl tracking-[0.5em]" type="text" maxLength={6} placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus />
                </div>
              )}
              <div className="flex items-center gap-3 pl-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="sr-only peer" />
                  <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded-md peer-checked:bg-primary peer-checked:border-primary peer-checked:text-white flex items-center justify-center transition-all">
                    {rememberMe && <span className="material-icons-round text-sm">check</span>}
                  </div>
                </label>
                <span className="text-sm font-bold text-gray-500 cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>{t('Remember Me')}</span>
              </div>
              <div id="recaptcha-container"></div>
              <button type="submit" disabled={loading} className="w-full py-5 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:scale-100">
                {loading ? 'Processing...' : (showOtp ? t('Verify & Login') : t('Get OTP'))}
              </button>
            </form>
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button type="button" onClick={() => { setIsLogin(!isLogin); setError(null); setShowOtp(false); setOtp(''); }} className="text-primary font-bold hover:underline">
                  {isLogin ? t('Register') : t('Sign In')}
                </button>
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* ═══ MOBILE: Swiggy/Zomato-style fullscreen ═══ */}
      <div className="md:hidden flex flex-col min-h-screen">

        {/* Top Hero — green gradient with illustration feel */}
        <div className="relative bg-gradient-to-br from-[#1a4a17] via-primary to-[#2d5a28] px-6 pt-12 pb-8 overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full" />
          <div className="absolute top-20 -left-6 w-24 h-24 bg-white/5 rounded-full" />
          <div className="absolute bottom-0 right-10 w-16 h-16 bg-white/8 rounded-full" />

          <div className="relative z-10">
            {/* Logo */}
            <div className="flex items-center gap-2 mb-8">
              <div className="w-9 h-9 bg-white/15 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <span className="material-icons-round text-white text-xl">eco</span>
              </div>
              <span className="text-white font-bold text-lg tracking-tight">KropScan</span>
            </div>

            {/* Title */}
            <h1 className="text-white text-[28px] font-extrabold leading-[1.15] mb-2">
              {isLogin ? (
                <>{t('Welcome Back')}<span className="inline-block ml-2 text-2xl">👋</span></>
              ) : (
                <>{t('Create Account')}</>
              )}
            </h1>
            <p className="text-white/60 text-[15px] leading-relaxed">
              {isLogin ? 'Sign in to scan your crops & get instant diagnosis' : 'Join thousands of farmers using AI'}
            </p>

            {/* Feature pills */}
            <div className="flex gap-2 mt-5 flex-wrap">
              {['Offline AI', '156 Diseases', '20 Crops'].map((tag) => (
                <span key={tag} className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-white/80 text-[11px] font-semibold tracking-wide">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Form Card — slides up over the hero */}
        <div className="flex-1 bg-white dark:bg-surface-dark -mt-4 rounded-t-[28px] px-6 pt-7 pb-8 relative z-10 shadow-[0_-4px_30px_rgba(0,0,0,0.08)]">

          {/* Role selector removed — admin login via access code only */}

          <form className="space-y-4" onSubmit={showOtp ? handleVerify : handleGetOtp}>
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center gap-2">
                <span className="material-icons-round text-base">error_outline</span>
                {error}
              </div>
            )}

            {/* Name (Registration) */}
            {!isLogin && !showOtp && (
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1 mb-1.5 block">{t('Full Name')}</label>
                <input
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-[15px]"
                  type="text"
                  placeholder="Rahul Singh"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}

            {/* Mobile Number */}
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1 mb-1.5 block">{t('Mobile Number')}</label>
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-14 bg-gray-100 dark:bg-gray-700/50 rounded-l-xl flex items-center justify-center border-r border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400 font-bold text-sm">+91</span>
                </div>
                <input
                  required
                  disabled={showOtp}
                  className="w-full pl-[62px] pr-4 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none font-semibold text-[16px] tracking-wider disabled:opacity-60"
                  type="tel"
                  maxLength={10}
                  placeholder="9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                />
                {showOtp && (
                  <button type="button" onClick={() => setShowOtp(false)} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary font-bold text-xs bg-primary/5 px-2.5 py-1 rounded-lg">
                    CHANGE
                  </button>
                )}
              </div>
            </div>

            {/* Admin Access Code */}
            {selectedRole === 'ADMIN' && !showOtp && (
              <div className="animate-fade-in">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1 mb-1.5 block">Admin Access Code</label>
                <input
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none"
                  type="password"
                  placeholder="Enter Code"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                />
              </div>
            )}

            {/* OTP Input */}
            {showOtp && (
              <div className="animate-fade-in">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">{t('Enter OTP')}</label>
                  <span className="text-[11px] text-gray-400">Sent to +91 {mobile}</span>
                </div>
                <input
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-center font-bold text-2xl tracking-[0.4em]"
                  type="text"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
            )}

            {/* Remember Me */}
            <div className="flex items-center gap-2.5 pl-0.5">
              <button type="button" onClick={() => setRememberMe(!rememberMe)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${rememberMe ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-600'}`}>
                {rememberMe && <span className="material-icons-round text-white text-xs">check</span>}
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400" onClick={() => setRememberMe(!rememberMe)}>{t('Remember Me')}</span>
            </div>

            {/* Recaptcha */}
            <div id="recaptcha-container"></div>

            {/* CTA Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-[16px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <span className="material-icons-round text-xl">{showOtp ? 'verified' : 'send'}</span>
                  {showOtp ? t('Verify & Login') : t('Get OTP')}
                </>
              )}
            </button>
          </form>

          {/* Switch Login/Register */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError(null); setShowOtp(false); setOtp(''); }}
                className="text-primary font-bold"
              >
                {isLogin ? t('Register') : t('Sign In')}
              </button>
            </p>
          </div>

          {/* Bottom trust badges */}
          <div className="mt-8 flex items-center justify-center gap-4 opacity-40">
            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium">
              <span className="material-icons-round text-sm">lock</span>
              Secure
            </div>
            <div className="w-px h-3 bg-gray-300" />
            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium">
              <span className="material-icons-round text-sm">wifi_off</span>
              Works Offline
            </div>
            <div className="w-px h-3 bg-gray-300" />
            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium">
              <span className="material-icons-round text-sm">verified</span>
              Free
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
