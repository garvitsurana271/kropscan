import React, { useState, useRef, useEffect } from 'react';
import { UserRole } from '../types';
import { fetchWeather, WeatherData } from '../services/WeatherService';
import { firebaseService } from '../services/FirebaseService';

interface HeaderProps {
  title: string;
  subtitle?: string;
  isDark: boolean;
  toggleTheme: () => void;
  onMenuClick: () => void;
  onSettingsClick: () => void;
  user?: { name: string; role: UserRole };
  language?: string;
  t: (key: string) => string;
  weather?: WeatherData | null;
  onNavigate?: (tab: any) => void;
}

const greetings: Record<string, string> = {
  'English': 'Hello',
  'Hindi (हिंदी)': 'नमस्ते',
  'Marathi (मराठी)': 'नमस्कार',
  'Punjabi (ਪੰਜਾਬੀ)': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ',
  'Telugu (తెలుగు)': 'నమస్కారం',
  'Tamil (தமிழ்)': 'வணக்கம்'
};

const Header: React.FC<HeaderProps> = ({ title, subtitle, isDark, toggleTheme, onMenuClick, onSettingsClick, user, language = 'English', t, weather, onNavigate }) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  // Internal weather state removed. Using prop 'weather'.
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const loadNotifs = async () => {
      try {
        const data = await firebaseService.getActiveNotifications();
        setNotifications(data.map((n: any) => ({
          ...n,
          time: new Date(n.timestamp).toLocaleDateString() // Simple date for now
        })));
      } catch (e) {
        console.error("Failed to load notifications", e);
      }
    };
    loadNotifs();
  }, []);

  const searchItems = [
    { key: 'Market Prices', label: t('Market Prices'), page: 'market', icon: 'trending_up', keywords: ['mandi', 'price', 'rates', 'sell', 'buy', 'paisa'] },
    { key: 'Scan Reports', label: t('Scan Reports'), page: 'history', icon: 'history', keywords: ['history', 'previous', 'records', 'past', 'scans'] },
    { key: 'Learning Center', label: t('Learning Center'), page: 'knowledge', icon: 'school', keywords: ['learn', 'guide', 'disease list', 'symptoms', 'education', 'wiki'] },
    { key: 'Community', label: t('Community'), page: 'community', icon: 'groups', keywords: ['forum', 'help', 'farmers', 'discussion', 'chat', 'experts'] },
    { key: 'AI Assistant', label: t('AI Assistant'), page: 'chatbot', icon: 'smart_toy', keywords: ['help', 'bot', 'kropbot', 'ask', 'chat', 'ai'] },
    { key: 'New Scan', label: t('New Scan'), page: 'scan', icon: 'add_a_photo', keywords: ['photo', 'diagnosis', 'check', 'camera', 'upload', 'potato', 'tomato', 'rice', 'wheat'] },
    { key: 'Settings', label: t('Settings'), page: 'settings', icon: 'settings', keywords: ['config', 'profile', 'logout', 'language', 'theme', 'dark mode'] },
  ];

  const filteredItems = searchQuery.trim() === '' ? [] : searchItems.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <header className="pt-[env(safe-area-inset-top)] h-auto md:h-24 bg-background-light dark:bg-background-dark border-b border-slate-100 dark:border-slate-800 flex items-center justify-between px-3 md:px-6 lg:px-12 py-1.5 md:py-0 shrink-0 z-20 sticky top-0 backdrop-blur-md">
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        <button onClick={onMenuClick} className="lg:hidden text-slate-500 dark:text-slate-300 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0">
          <span className="material-icons-round text-xl md:text-2xl">menu</span>
        </button>
        <div>
          {user?.role === 'USER' ? (
            <div className="space-y-0.5">
              <h2 className="text-lg md:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-1.5 md:gap-2 truncate max-w-[180px] sm:max-w-none">
                {greetings[language] || t('Hello')}, {user.name.split(' ')[0]} <span className="text-xl md:text-2xl animate-bounce-slow shrink-0">👋</span>
              </h2>
              <p className="text-slate-400 font-medium text-xs uppercase tracking-widest hidden md:block">{t('HappenToday')}</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                {title}
              </h1>
              {subtitle && <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{subtitle}</p>}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 md:gap-5">
        {user?.role === 'USER' && (
          <div className="hidden sm:flex bg-white dark:bg-surface-dark px-5 py-2.5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 items-center gap-3">
            <span className="material-icons-round text-orange-500">{weather?.icon || 'wb_sunny'}</span>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-black text-slate-800 dark:text-white">{weather ? `${weather.temperature}°C` : '--'}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase">{weather?.condition || 'Loading...'}</span>
            </div>
          </div>
        )}

        {/* Global Search (Desktop only) */}
        <div className="hidden lg:flex flex-col relative" ref={searchContainerRef}>
          <div
            onClick={() => searchInputRef.current?.focus()}
            className="flex items-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl px-4 py-2.5 border border-gray-100 dark:border-gray-700 w-64 xl:w-80 group hover:border-primary/50 transition-colors cursor-text"
          >
            <span className="material-icons-round text-gray-400 mr-2 group-hover:text-primary transition-colors">search</span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(searchQuery.length > 0)}
              className="bg-transparent border-none outline-none text-sm w-full text-gray-700 dark:text-gray-300 placeholder-gray-400"
            />
            <div className="ml-auto bg-white dark:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-gray-500 flex items-center gap-0.5">
              <span>Ctrl</span><span>K</span>
            </div>
          </div>

          {showSearchResults && filteredItems.length > 0 && (
            <div className="absolute top-14 left-0 right-0 bg-white dark:bg-surface-dark rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {filteredItems.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onNavigate?.(item.page);
                    setShowSearchResults(false);
                    setSearchQuery('');
                  }}
                  className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <span className="material-icons-round text-gray-400 text-lg">{item.icon}</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative w-8 h-8 md:w-12 md:h-12 bg-white dark:bg-surface-dark rounded-lg md:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-primary transition-all group"
          >
            <span className="material-icons-round text-[18px] md:text-[24px]">notifications</span>
            {notifications.length > 0 && <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-surface-dark group-hover:scale-125 transition-transform"></span>}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-14 w-[calc(100vw-2rem)] sm:w-80 md:w-96 max-w-[360px] bg-white dark:bg-surface-dark rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-4 z-50 animate-fade-in">
              <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
                <button className="text-xs text-primary font-bold hover:underline">Mark all read</button>
              </div>
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer flex gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${n.type === 'warning' ? 'bg-orange-100 text-orange-500' :
                      n.type === 'success' ? 'bg-green-100 text-green-500' : 'bg-blue-100 text-blue-500'
                      }`}>
                      <span className="material-icons-round text-lg">
                        {n.type === 'warning' ? 'warning' : n.type === 'success' ? 'trending_up' : 'info'}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{n.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight my-1">{n.message}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                View All Notifications
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onSettingsClick}
          className="w-8 h-8 md:w-12 md:h-12 bg-white dark:bg-surface-dark rounded-lg md:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-primary transition-all"
        >
          <span className="material-icons-round text-[18px] md:text-[24px]">settings</span>
        </button>

        <button
          onClick={toggleTheme}
          className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 text-slate-500 hover:text-primary transition-all bg-white dark:bg-surface-dark flex items-center justify-center"
        >
          <span className="material-icons-round dark:hidden text-lg">dark_mode</span>
          <span className="material-icons-round hidden dark:block text-lg">light_mode</span>
        </button>
      </div>
    </header>
  );
};

export default Header;