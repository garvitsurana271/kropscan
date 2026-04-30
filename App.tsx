import React, { useState } from 'react';
import { NavItem, UserRole, UserProfile } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserDashboard from './pages/UserDashboard';
import ScanWorkspace from './pages/ScanWorkspace';
import DiagnosisResult from './pages/DiagnosisResult';
import History from './pages/History';
import MarketPrices from './pages/MarketPrices';
import LearningCenter from './pages/LearningCenter';
import Community from './pages/Community';
import Settings from './pages/Settings';
import Upgrade from './pages/Upgrade';
// import OrgDashboard from './pages/OrgDashboard'; // REMOVED
import AiBot from './pages/AiBot';
import AdminDBEditor from './pages/AdminDBEditor';
import AdminUserManagement from './pages/AdminUserManagement';
import AdminMarket from './pages/AdminMarket';
import AdminCommunity from './pages/AdminCommunity';
import JhumAdvisory from './pages/JhumAdvisory';
import AshaReport from './pages/AshaReport';
import { PredictionResult } from './services/ClassifierService';
import { getTranslation } from './utils/translations';
import LanguageModal from './components/LanguageModal';

import { fetchWeather, WeatherData } from './services/WeatherService';
import { Toaster, toast } from 'sonner';
import ModelDownloadIndicator from './components/ModelDownloadIndicator';
import { hasStaticTranslations, hasDynamicTranslations, prefetchLanguageDict } from './utils/translations';

// Detect if running inside Capacitor native shell
// Capacitor injects window.Capacitor before page load on native platforms
const isNativeApp = (() => {
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
    if (cap && cap.platform && cap.platform !== 'web') return true;
    // Fallback: Capacitor Android serves from https://localhost
    if (window.location.origin === 'https://localhost') return true;
    return false;
})();

function App() {
  // Native app skips landing page — goes straight to login
  const [activeTab, setActiveTab] = useState<NavItem>(isNativeApp ? 'login' : 'home');
  const [isDark, setIsDark] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [language, setLanguageRaw] = useState(() => localStorage.getItem('app_language') || 'English');
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(-1);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [transVersion, setTransVersion] = useState(0); // bumps after dynamic translation cache is filled to force re-render

  // Wraps setLanguage with auto-translation prefetch for languages outside the static dict.
  // Tribal langs (Bodo / Mizo / Khasi / Manipuri) hit this path; static-supported langs return immediately.
  const setLanguage = React.useCallback(async (lang: string) => {
    setLanguageRaw(lang);
    localStorage.setItem('app_language', lang);

    if (lang === 'English' || hasStaticTranslations(lang) || hasDynamicTranslations(lang)) {
      return; // covered by static dict or already cached — no fetch needed
    }

    const langLabel = lang.split('(')[0].trim();
    const toastId = toast.loading(`Translating UI to ${langLabel}…`, { duration: Infinity });
    try {
      await prefetchLanguageDict(lang, (pct) => {
        toast.loading(`Translating UI to ${langLabel}… ${pct}%`, { id: toastId, duration: Infinity });
      });
      toast.success(`UI translated to ${langLabel}`, { id: toastId, duration: 2000 });
      setTransVersion((v) => v + 1); // forces components reading translations to re-render
    } catch (err) {
      console.warn('Language prefetch failed', err);
      toast.error(`Could not translate to ${langLabel} — using English fallback`, { id: toastId, duration: 3000 });
    }
  }, []);

  React.useEffect(() => {
    // 1. Subscribe to AI Model Download Progress
    import('./services/TFService').then(m => {
      m.tfService.onProgress((percent) => {
        setDownloadProgress(percent);
      });
    });

    // 2. Fetch Weather Logic (Lifted from Header)
    const defaultLat = 21.1458;
    const defaultLon = 79.0882;

    const loadWeather = async (lat: number, lon: number) => {
      try {
        const data = await fetchWeather(lat, lon);
        setWeather(data);
      } catch (e) {
        console.error("Weather fetch failed in App", e);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          loadWeather(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          if (import.meta.env.DEV) console.warn("Geolocation warning in App", error);
          loadWeather(defaultLat, defaultLon);
        }
      );
    } else {
      loadWeather(defaultLat, defaultLon);
    }

    // 3. Show modal if no language set in localStorage
    if (!localStorage.getItem('app_language')) {
      setIsLanguageModalOpen(true);
    }
  }, []);

  const handleLanguageSelect = async (lang: string) => {
    setIsLanguageModalOpen(false);
    // setLanguage already handles localStorage + prefetch
    setLanguage(lang);

    // Sync to user profile if logged in
    if (user) {
      const { firebaseService } = await import('./services/FirebaseService');
      await firebaseService.updateUser(user.id, { language: lang });
    }
  };

  const [user, setUser] = useState<UserProfile | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<PredictionResult | null>(null);
  const [isExistingDiagnosis, setIsExistingDiagnosis] = useState(false);

  // transVersion in the closure forces a new t reference after dynamic translations finish
  // so components reading text re-render with the freshly cached translations.
  const t = React.useCallback(
    (key: string) => getTranslation(language, key),
    [language, transVersion]
  );

  // Scroll Reset Logic
  const mainRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [activeTab]);

  // Check for existing session (Firebase + Legacy Fallback)
  // Check for existing session (Firebase + Legacy Fallback)
  React.useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;
    let authUnsubscribe: (() => void) | null = null;

    const setupAuth = async () => {
      const { firebaseService } = await import('./services/FirebaseService');

      authUnsubscribe = firebaseService.subscribeToAuthChanges(async (fbUser) => {
        // Clean up previous profile listener if user changes/logs out
        if (profileUnsubscribe) {
          profileUnsubscribe();
          profileUnsubscribe = null;
        }

        if (fbUser) {
          if (import.meta.env.DEV) console.log("Restoring Firebase Session for:", fbUser.phoneNumber);

          try {
            // 3. START REAL-TIME LISTENER (Fixes "Farmer" persistence)
            // We still sync once to ensure document exists
            await firebaseService.syncUserToDB(fbUser);
            if (import.meta.env.DEV) console.log("Sync completed, subscribing to profile...");

            // Now listen for updates (e.g. valid name saving from Login.tsx)
            profileUnsubscribe = firebaseService.subscribeToUserProfile(fbUser.uid, (dbUser) => {
              if (import.meta.env.DEV) console.log("Profile update received:", dbUser);
              if (dbUser) {
                const newUser = {
                  id: fbUser.uid,
                  uid: fbUser.uid,
                  name: dbUser.name || fbUser.displayName || 'User',
                  role: dbUser.role || 'USER',
                  plan: dbUser.plan || 'Free',
                  avatar: dbUser.avatar || fbUser.photoURL,
                  mobile: dbUser.mobile || fbUser.phoneNumber,
                  email: dbUser.email || fbUser.email,
                  scansCount: dbUser.scansCount,
                  lastScanDate: dbUser.lastScanDate,
                  chatCount: dbUser.chatCount,
                  lastChatDate: dbUser.lastChatDate
                } as UserProfile;

                setUser(newUser);

                setActiveTab(prev => {
                  if (prev === 'home' || prev === 'login') return 'dashboard';
                  return prev;
                });
              } else {
                if (import.meta.env.DEV) console.warn("User profile missing in DB despite sync! Using fallback.");
                // Fallback: Create basic user so app doesn't break
                const fallbackUser = {
                  id: fbUser.uid,
                  uid: fbUser.uid,
                  name: fbUser.displayName || 'User',
                  role: 'USER',
                  plan: 'Free',
                  avatar: fbUser.photoURL,
                  mobile: fbUser.phoneNumber,
                  email: fbUser.email
                } as UserProfile;
                setUser(fallbackUser);
                setActiveTab(prev => (prev === 'home' || prev === 'login') ? 'scan' : prev);
              }
            });
          } catch (err) {
            console.error("Error in auth flow:", err);
          }
        } else {
          if (import.meta.env.DEV) console.log("No Firebase User found.");
          // 2. Legacy Local Token Fallback (for older accounts or admin mock)
          const token = localStorage.getItem('kropscan_auth_token');
          if (token) {
            const user = await import('./services/DatabaseService').then(m => m.dbService.validateSession(token));
            if (user) {
              setUser(user as any);
              setActiveTab(prev => (prev === 'home' || prev === 'login') ? 'dashboard' : prev);
            }
          } else {
            setUser(null);
          }
        }
      });
    };

    setupAuth();

    return () => {
      if (authUnsubscribe) authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    if (!isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleLogin = (role: UserRole, userDataOrName?: any) => { // Adapted to handle both legacy string and new User object if needed, but strict is better
    if (typeof userDataOrName === 'object') {
      setUser(userDataOrName);
    } else {
      // Fallback or Admin bypass (Simplified)
      if (role === 'ADMIN') {
        setUser({
          name: 'Admin Controller',
          plan: 'Enterprise',
          avatar: 'https://i.pravatar.cc/150?u=admin',
          role
        });
      } else {
        // Only allow explicit login
        console.error("Login requires full user object");
      }
    }
    setActiveTab('dashboard');
  };

  const handleUserUpdate = (updatedUser: Partial<UserProfile>) => {
    if (user) {
      setUser({ ...user, ...updatedUser });
    }
  };

  const handleLogout = async () => {
    // Sign out from Firebase Auth (clears IndexedDB session)
    const { firebaseService } = await import('./services/FirebaseService');
    await firebaseService.logout();

    // Also clear legacy local token if present
    const token = localStorage.getItem('kropscan_auth_token');
    if (token) {
      await import('./services/DatabaseService').then(m => m.dbService.removeSession(token));
      localStorage.removeItem('kropscan_auth_token');
    }
    setUser(null);
    setActiveTab(isNativeApp ? 'login' : 'home');
  };

  const handleNavigate = (tab: NavItem, data?: any) => {
    if (data) {
      if (tab === 'diagnosis_result' as any || tab === 'chatbot') {
        setDiagnosisResult(data);
        if (tab === 'diagnosis_result' as any) {
          setIsExistingDiagnosis(!!data.isExisting);
        }
      }
    } else if (tab === 'scan') {
      setIsExistingDiagnosis(false);
    } else if (tab === 'chatbot') {
      // Navigating to chatbot without data (e.g. from sidebar) — clear stale diagnosis
      setDiagnosisResult(null);
    }
    setActiveTab(tab);
  };

  const renderContent = () => {
    if (activeTab === 'home') {
      return <LandingPage onGetStarted={() => setActiveTab('login')} onLogin={() => setActiveTab('login')} t={t} />;
    }

    if (activeTab === 'login') {
      return <Login onLogin={handleLogin} t={t} />;
    }

    // Guard: if user is null but we're on a protected page (logout race condition)
    if (!user) {
      if (isNativeApp) {
        return <Login onLogin={handleLogin} t={t} />;
      }
      return <LandingPage onGetStarted={() => setActiveTab('login')} onLogin={() => setActiveTab('login')} t={t} />;
    }

    if (activeTab === 'overview') {
      return user?.role === 'ADMIN' ? <Dashboard t={t} /> : <UserDashboard user={user!} t={t} onNavigate={setActiveTab} />;
    }
    // Common props for pages that might need them
    const commonProps = {
      language,
      onNavigate: handleNavigate,
      t, // Pass translation helper
      user
    };

    switch (activeTab) {
      case 'dashboard':
        if (user?.role === 'ADMIN') return <Dashboard t={t} onNavigate={handleNavigate} />;
        // if (user?.role === 'ORGANIZATION') return <OrgDashboard user={user} t={t} onNavigate={handleNavigate} />; // REMOVED as per request
        return <UserDashboard {...commonProps} />;
      // case 'org_dashboard': 
      //   return <OrgDashboard user={user!} t={t} onNavigate={handleNavigate} />;
      case 'scan':
        return <ScanWorkspace
          t={t}
          user={user!}
          language={language}
          onUserUpdate={handleUserUpdate}
          onResult={(result) => {
            setDiagnosisResult(result);
            setIsExistingDiagnosis(false);
            setActiveTab('diagnosis_result' as any);
          }} />;
      case 'diagnosis_result' as any:
        return <DiagnosisResult result={diagnosisResult} onBack={() => setActiveTab('scan')} user={user} onNavigate={handleNavigate} isExisting={isExistingDiagnosis} language={language} />;
      case 'history':
        return <History user={user} language={language} />;
      case 'market':
        if (user?.role === 'ADMIN') return <AdminMarket />;
        return <MarketPrices user={user} t={t} onNavigate={handleNavigate} language={language} />;
      case 'knowledge':
        return <LearningCenter {...commonProps} user={user} language={language} />;
      case 'community':
        if (user?.role === 'ADMIN') return <AdminCommunity />;
        return <Community user={user} language={language} />;
      case 'jhum':
        return <JhumAdvisory user={user} language={language} t={t} />;
      case 'asha':
        return <AshaReport user={user} t={t} />;
      case 'admin_db':
        return user?.role === 'ADMIN' ? <AdminDBEditor /> : <UserDashboard {...commonProps} />;
      case 'admin_users':
        return user?.role === 'ADMIN' ? <AdminUserManagement /> : <UserDashboard {...commonProps} />;
      case 'broadcast': // Added to handle broadcast navigation if needed, though mostly modal
        return user?.role === 'ADMIN' ? <Dashboard t={t} onNavigate={handleNavigate} /> : <UserDashboard {...commonProps} />;
      case 'upgrade':
        return <Upgrade user={user} onUpgradeSuccess={(updatedUser) => {
          handleUserUpdate(updatedUser);
          // Optionally redirect back or show success
        }} onBack={() => setActiveTab('settings')} t={t} />;
      case 'settings':
        return <Settings language={language} setLanguage={setLanguage} user={user} t={t} onUpdateUser={handleUserUpdate} onLogout={handleLogout} isDark={isDark} toggleTheme={toggleTheme} />;
      case 'chatbot':
        return <AiBot latestDiagnosis={diagnosisResult} user={user!} weather={weather} language={language} />;
      default:
        return user?.role === 'ADMIN' ? <Dashboard t={t} onNavigate={handleNavigate} /> : <UserDashboard {...commonProps} />;
    }
  };

  if (activeTab === 'home' || activeTab === 'login') {
    return renderContent();
  }

  // Scroll Reset Logic moved to top

  return (
    <div className={`flex h-screen overflow-hidden ${isDark ? 'dark' : ''} bg-background-light dark:bg-background-dark`}>
      {user && <Sidebar
        activeTab={activeTab === 'diagnosis_result' as any ? 'scan' : activeTab}
        setActiveTab={(tab) => { if (tab === 'chatbot') setDiagnosisResult(null); setActiveTab(tab); }}
        user={user}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        t={t}
        language={language}
      />}

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        {user && <Header
          title={activeTab === 'dashboard' ? (user?.role === 'ADMIN' ? 'Admin Control Center' : 'Farmer Dashboard') : activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('_', ' ')}
          subtitle={activeTab === 'dashboard' ? new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : undefined}
          isDark={isDark}
          toggleTheme={toggleTheme}
          onMenuClick={() => setIsMobileMenuOpen(true)}
          onSettingsClick={() => setActiveTab('settings')}
          onNavigate={handleNavigate}
          user={user}
          language={language}
          t={t}
          weather={weather}
        />}
        <main ref={mainRef} className={`flex-1 ${activeTab === 'chatbot' ? 'overflow-hidden' : 'overflow-x-hidden overflow-y-auto pb-20'} bg-background-light dark:bg-background-dark`}>
          {renderContent()}
        </main>
      </div>
      <LanguageModal
        isOpen={isLanguageModalOpen}
        onSelect={handleLanguageSelect}
      />
      <ModelDownloadIndicator progress={downloadProgress} />
      <Toaster position="top-center" richColors theme={isDark ? 'dark' : 'light'} />

      {/* Persistent Fast Scan FAB */}
      {user && activeTab !== 'scan' && activeTab !== 'chatbot' && (
        <button
          onClick={() => handleNavigate('scan')}
          className="fixed bottom-6 right-6 z-50 w-16 h-16 bg-primary text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-105 hover:bg-[#345f30] active:scale-95 transition-all outline-none"
          title="Fast Scan"
        >
          <span className="material-icons-round text-3xl">add_a_photo</span>
        </button>
      )}

    </div>
  );
}

export default App;