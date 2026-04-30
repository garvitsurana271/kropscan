import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchWeather, WeatherData } from '../services/WeatherService';
import { NavItem, UserProfile, CropScan } from '../types';
import { dbService } from '../services/DatabaseService';
import { subscriptionService } from '../services/SubscriptionService';
import UpgradeModal from '../components/UpgradeModal';

interface UserDashboardProps {
  language?: string;
  onNavigate?: (tab: NavItem, data?: any) => void;
  user?: UserProfile | null;
  t: (key: string) => string;
}

const UserDashboard: React.FC<UserDashboardProps> = ({ language, onNavigate, user, t }) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [recentDiagnosis, setRecentDiagnosis] = useState<CropScan[]>([]);
  const [cropTasks, setCropTasks] = useState<{ day: string; task: string; crop: string }[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [myCrops, setMyCrops] = useState<string[]>([]);

  useEffect(() => {
    const savedCrops = localStorage.getItem('kropscan_my_crops');
    if (savedCrops) {
      try { setMyCrops(JSON.parse(savedCrops)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    // Default to a central location (e.g. Nagpur, India) if geo fails or while waiting
    const defaultLat = 21.1458;
    const defaultLon = 79.0882;

    const loadWeather = async (lat: number, lon: number) => {
      const data = await fetchWeather(lat, lon);
      setWeather(data);
      setWeatherLoading(false);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          loadWeather(position.coords.latitude, position.coords.longitude);
        },
        async (error) => {
          console.log("Geo access info: Browser denied/timeout. Using default location.", error.message);
          loadWeather(defaultLat, defaultLon);
        }
      );
    } else {
      loadWeather(defaultLat, defaultLon);
    }
  }, []);

  useEffect(() => {
    const loadDashboardData = async () => {
      if (user?.id) {
        try {
          const reports = await dbService.getUserReports(user.id);
          setRecentDiagnosis(reports.slice(0, 3)); // Top 3

          // Generate Tasks
          const tasks: any[] = [];
          const invalidCrops = ['System Error', 'Unknown', 'Background', 'Non-Plant', 'Undefined', 'Generic'];
          let uniqueCrops = Array.from(new Set(reports.map(r => r.cropName)))
            .filter(crop => crop && !invalidCrops.includes(crop) && crop.length > 2);

          // Filter by user's crop portfolio if set
          if (myCrops.length > 0) {
            uniqueCrops = uniqueCrops.filter(crop =>
              myCrops.some(mc => crop.toLowerCase().includes(mc.toLowerCase()))
            );
          }

          uniqueCrops.slice(0, 3).forEach((crop) => {
            tasks.push({ day: t('Tomorrow'), task: `${t('Apply fertilizer for')} ${crop}`, crop: crop });
            tasks.push({ day: t('In 3 Days'), task: `${t('Check')} ${crop} ${t('soil moisture')}`, crop: crop });
          });
          setCropTasks(tasks);
        } catch (e) {
          console.error("Failed to load user reports", e);
        }
      }
    };
    loadDashboardData();
  }, [user, myCrops]);

  const handleDiagnosisClick = (item: CropScan) => {
    if (!onNavigate) return;

    const resultToPass = {
      confidence: item.confidence || 0.9,
      allProbabilities: [],
      disease: {
        id: 1, // Placeholder ID, real app might use UUID
        name: item.diagnosis || 'Unknown',
        scientificName: item.cropName + " " + item.diagnosis,
        crop: item.cropName,
        treatment: {
          chemical: ["Standard fungicide application"], // In real app, re-fetch full treatment from DB
          organic: ["Neem oil spray"]
        },
        prevention: ["Crop rotation", "Soil testing"],
        image: item.imageUrl,
        symptoms: [],
        cure: []
      },
      isExisting: true
    };
    onNavigate('diagnosis_result' as any, resultToPass);
  };

  // Smart Alerts notification generation
  const generateSmartAlerts = (): { id: string; icon: string; title: string; description: string; timestamp: string; borderColor: string }[] => {
    const alerts: { id: string; icon: string; title: string; description: string; timestamp: string; borderColor: string }[] = [];

    // Weather-based: high humidity alert
    if (weather && weather.humidity > 80) {
      alerts.push({
        id: 'humidity-alert',
        icon: 'water_drop',
        title: t('High Humidity Alert'),
        description: t('High humidity alert desc'),
        timestamp: t('2h ago'),
        borderColor: 'border-l-red-500',
      });
    }

    // Disease follow-up: if recent scans have diseases (not Healthy)
    const invalidCrops = ['System Error', 'Unknown', 'Background', 'Non-Plant', 'Undefined', 'Generic'];
    const diseasedScans = recentDiagnosis.filter(
      (s) => s.status === 'Critical' && s.diagnosis && s.cropName && !invalidCrops.includes(s.cropName)
    );
    if (diseasedScans.length > 0) {
      const scan = diseasedScans[0];
      const desc = t('Recheck crop disease')
        .replace('{crop}', scan.cropName)
        .replace('{disease}', scan.diagnosis || '');
      alerts.push({
        id: `followup-${scan.id}`,
        icon: 'healing',
        title: t('Follow-up Needed'),
        description: desc,
        timestamp: t('Today'),
        borderColor: 'border-l-orange-500',
      });
    }

    // Time-based: if last scan was > 7 days ago or no scans
    const lastScanDate = recentDiagnosis.length > 0 ? new Date(recentDiagnosis[0].date) : null;
    const daysSinceLastScan = lastScanDate ? (Date.now() - lastScanDate.getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    if (daysSinceLastScan > 7) {
      alerts.push({
        id: 'scan-reminder',
        icon: 'schedule',
        title: t('Time to Scan'),
        description: t('Scan reminder desc'),
        timestamp: t('1w ago'),
        borderColor: 'border-l-blue-500',
      });
    }

    return alerts.slice(0, 3);
  };

  const smartAlerts = generateSmartAlerts().filter((a) => !dismissedAlerts.has(a.id));

  const dismissAlert = (id: string) => {
    setDismissedAlerts((prev) => new Set(prev).add(id));
  };

  const isFirstRun = recentDiagnosis.length === 0 && !localStorage.getItem('kropscan_onboarded');

  return (
    <div className="p-2.5 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-2.5 md:space-y-8 animate-fade-in">

      {/* First-Run Onboarding */}
      {isFirstRun && (
        <div className="bg-gradient-to-br from-green-600 via-emerald-600 to-green-700 rounded-2xl md:rounded-3xl p-5 md:p-8 text-white relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-12 -mt-12" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-8 -mb-8" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full text-xs font-bold mb-4 backdrop-blur-sm">
              <span className="material-icons-round text-sm">waving_hand</span>
              {t('Welcome to KropScan')}
            </div>
            <h2 className="text-xl md:text-2xl lg:text-3xl font-extrabold mb-2">{t('Hello')}, {user?.name?.split(' ')[0] || 'Farmer'}!</h2>
            <p className="text-green-100 max-w-lg mb-6">{t('Get started by scanning your first crop. Just take a photo of any leaf and our AI will diagnose it instantly — even without internet.')}</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => { onNavigate?.('scan' as any); localStorage.setItem('kropscan_onboarded', '1'); }}
                className="bg-white text-green-700 px-6 py-3 rounded-full font-bold text-sm hover:bg-green-50 transition-colors shadow-lg flex items-center gap-2">
                <span className="material-icons-round text-xl">qr_code_scanner</span>
                {t('Scan Your First Crop')}
              </button>
              <button onClick={() => localStorage.setItem('kropscan_onboarded', '1')}
                className="bg-white/15 text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-white/25 transition-colors backdrop-blur-sm flex items-center gap-2">
                {t('Explore Dashboard')}
              </button>
            </div>
            <div className="flex gap-6 mt-6 pt-4 border-t border-white/10">
              {[
                { icon: 'offline_bolt', label: t('Works Offline') },
                { icon: 'translate', label: '15 Languages' },
                { icon: 'eco', label: '25+ Crops · 60+ Diseases' },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-green-200 text-xs font-medium">
                  <span className="material-icons-round text-sm">{f.icon}</span>
                  {f.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upper Grid: Hero & Weather Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Hero Section */}
        <div className="lg:col-span-2 bg-gradient-to-br from-[#1a4a17] via-primary to-[#2d5a28] md:bg-gradient-to-r md:from-primary md:to-[#507d2a] rounded-2xl md:rounded-[2rem] p-4 md:p-8 text-white shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-16 -mt-16 transform transition-transform group-hover:scale-110 duration-700"></div>
          <div className="absolute bottom-0 right-20 w-32 h-32 bg-white opacity-5 rounded-full transform transition-transform group-hover:scale-125 duration-700"></div>
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-8 h-full">
            <div className="max-w-md space-y-3 md:space-y-4">
              <div className="flex flex-wrap gap-2 md:gap-3">
                <div className="inline-flex items-center gap-1.5 md:gap-2 bg-white/20 backdrop-blur-sm px-3 md:px-4 py-1 md:py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider">
                  <span className="material-icons-round text-sm">auto_awesome</span>
                  {t('AI-Powered Diagnosis')}
                </div>
                {/* Scan Usage Badge */}
                <div className={`inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1 md:py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider shadow-sm border border-white/10 ${subscriptionService.checkLimit(user || { name: 'Guest', role: 'USER', plan: 'Free', avatar: '' }, 'scans').allowed
                  ? 'bg-green-500/20 text-white'
                  : 'bg-red-500/20 text-red-100'
                  }`}>
                  <span className="material-icons-round text-sm">center_focus_strong</span>
                  {(() => {
                    const limit = subscriptionService.checkLimit(user || { name: 'Guest', role: 'USER', plan: 'Free', avatar: '' }, 'scans');
                    return limit.limit > 100 ? t('Unlimited Scans') : `${limit.limit - limit.remaining}/${limit.limit} ${t('Scans')}`;
                  })()}
                </div>
              </div>

              <h3 className="text-2xl md:text-3xl lg:text-4xl font-extrabold leading-[1.1]">{t('Diagnose Crop Health')}</h3>
              <p className="text-green-50/80 max-w-sm text-sm md:text-base">
                {t('Detect diseases early')}
              </p>
              <div className="flex flex-wrap gap-3 md:gap-4 pt-3 md:pt-4">
                <button
                  onClick={() => {
                    if (!onNavigate) return;
                    const check = subscriptionService.checkLimit(user || { name: 'Guest', role: 'USER', plan: 'Free', avatar: '' }, 'scans');
                    if (check.allowed) {
                      onNavigate('scan' as any);
                    } else {
                      if (!subscriptionService.checkLimit(user || { name: 'Guest', role: 'USER', plan: 'Free', avatar: '' }, 'scans').allowed) {
                        setShowUpgradeModal(true);
                      }
                    }
                  }}
                  className={`bg-white text-primary hover:bg-green-50 font-bold py-3 px-6 md:py-3.5 md:px-8 rounded-2xl flex items-center gap-2 transition-all shadow-lg hover:-translate-y-0.5 text-sm md:text-base ${!subscriptionService.checkLimit(user || { name: 'Guest', role: 'USER', plan: 'Free', avatar: '' }, 'scans').allowed ? 'opacity-75 grayscale' : ''
                    }`}
                >
                  <span className="material-icons-round">
                    {!subscriptionService.checkLimit(user || { name: 'Guest', role: 'USER', plan: 'Free', avatar: '' }, 'scans').allowed ? 'lock' : 'add_a_photo'}
                  </span>
                  {t('Upload Image')}
                </button>
                <button
                  onClick={() => onNavigate && onNavigate('history' as any)}
                  className="bg-primary/40 hover:bg-primary/50 text-white font-bold py-3 px-6 md:py-3.5 md:px-8 rounded-2xl flex items-center gap-2 border border-white/20 transition-all text-sm md:text-base"
                >
                  {t('Scan History')}
                </button>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="w-40 h-40 bg-white/10 rounded-3xl flex items-center justify-center border border-white/20 backdrop-blur-md relative group-hover:rotate-3 transition-transform">
                <span className="material-icons-round text-7xl text-white opacity-90">qr_code_scanner</span>
                <div className="absolute -top-3 -right-3 bg-secondary text-primary text-xs font-black px-3 py-1 rounded-lg shadow-md">{t('NEW')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Weather Card - Dynamic (Hide if failed) */}
        {(weather || weatherLoading) && (
          <div className="bg-white dark:bg-surface-dark rounded-xl md:rounded-[2rem] p-3 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col relative overflow-hidden">
            {/* Mobile: Compact inline weather strip */}
            <div className="md:hidden">
              {weather ? (
                <div className="flex items-center gap-3">
                  <span className="material-icons-round text-3xl text-primary">{weather.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-slate-800 dark:text-white">{weather.temperature}°C</span>
                      <span className="text-xs text-slate-400 font-bold uppercase">{weather.condition}</span>
                    </div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[11px] text-slate-500"><span className="font-bold">{weather.humidity}%</span> humidity</span>
                      <span className="text-[11px] text-slate-500"><span className="font-bold">{weather.windSpeed}</span> km/h</span>
                    </div>
                  </div>
                  {weather?.isRainy && <span className="bg-orange-100 text-orange-600 text-[9px] px-2 py-0.5 rounded-full font-black uppercase">{t('Rain Alert')}</span>}
                </div>
              ) : (
                <div className="animate-pulse flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                  <div className="h-4 w-24 bg-gray-200 rounded"></div>
                </div>
              )}
            </div>
            {/* Desktop: Full weather card */}
            <div className="hidden md:flex flex-col flex-1">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg text-slate-800 dark:text-white">{t('Live Weather')}</h3>
                {weather?.isRainy && <span className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest">{t('Rain Alert')}</span>}
              </div>
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                {weather ? (
                  <>
                    <span className="material-icons-round text-7xl text-primary dark:text-primary">{weather.icon}</span>
                    <div>
                      <p className="font-extrabold text-slate-800 dark:text-slate-200 text-4xl">{weather.temperature}°C</p>
                      <p className="text-sm text-slate-400 font-bold uppercase tracking-wide mt-1">{weather.condition}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 w-full mt-4">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase">{t('Humidity')}</span>
                        <span className="text-lg font-bold text-slate-700 dark:text-slate-300">{weather.humidity}%</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase">{t('Wind')}</span>
                        <span className="text-lg font-bold text-slate-700 dark:text-slate-300">{weather.windSpeed} km/h</span>
                      </div>
                    </div>
                    <div className="w-full mt-auto">
                      <span className="font-black text-[10px] uppercase tracking-widest text-primary mb-2 block text-left">{t('Farming Insight')}:</span>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium text-left">
                        {weather?.isRainy ? t('Moisture Msg') : t('Optimal Msg')}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="animate-pulse flex flex-col items-center">
                    <div className="h-16 w-16 bg-gray-200 dark:bg-gray-700 rounded-full mb-4"></div>
                    <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Predictive Farm Radar Alert */}
      {weather && (weather.humidity > 70 || weather.temperature > 30) && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl md:rounded-[2rem] p-3 md:p-6 relative overflow-hidden group">
           <div className="absolute -top-10 -right-10 w-40 h-40 bg-red-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform"></div>
           <div className="flex flex-col md:flex-row items-start md:items-center gap-6 relative z-10">
              <div className="p-4 bg-white dark:bg-red-900/50 rounded-2xl shadow-sm border border-red-100 dark:border-red-800/50">
                 <span className="material-icons-round text-4xl text-red-500 animate-pulse">radar</span>
              </div>
              <div className="flex-1">
                 <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-black text-red-900 dark:text-red-300 text-base md:text-xl tracking-wide">{t('Farm Radar Alert')}</h4>
                    <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">{t('High Risk')}</span>
                 </div>
                 <p className="text-red-800/80 dark:text-red-400 font-medium">
                    {weather.humidity > 75 && weather.temperature > 25
                      ? t('Radar Fungal Blight')
                      : weather.temperature > 35
                      ? t('Radar Heat Warning')
                      : t('Radar Elevated Metrics')}
                 </p>
              </div>
              <button onClick={() => onNavigate && onNavigate('chatbot' as any)} className="shrink-0 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-red-600/30 w-full md:w-auto text-center flex items-center justify-center gap-2">
                 {t('Ask KropBot')} <span className="material-icons-round text-sm">arrow_forward</span>
              </button>
           </div>
        </div>
      )}

      {/* Smart Alerts */}
      {smartAlerts.length > 0 && (
        <div className="bg-white dark:bg-surface-dark rounded-xl md:rounded-[2rem] p-3 md:p-6 shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3 md:mb-5">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg md:rounded-xl">
                <span className="material-icons-round text-xl md:text-2xl text-amber-500">notifications_active</span>
              </div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">{t('Smart Alerts')}</h3>
            </div>
            <span className="bg-primary/10 text-primary text-xs font-bold px-3 py-1 rounded-full">{smartAlerts.length}</span>
          </div>
          <div className="space-y-3">
            {smartAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-2.5 md:gap-4 p-2.5 md:p-4 rounded-xl md:rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 border-l-[3px] md:border-l-4 ${alert.borderColor} transition-all hover:shadow-sm`}
              >
                <div className={`p-1.5 md:p-2.5 rounded-lg md:rounded-xl shrink-0 ${
                  alert.borderColor === 'border-l-red-500' ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' :
                  alert.borderColor === 'border-l-orange-500' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400' :
                  'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                }`}>
                  <span className="material-icons-round text-lg md:text-xl">{alert.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5 md:mb-1">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-[13px] md:text-sm">{alert.title}</h4>
                    <span className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-wider shrink-0 ml-2">{alert.timestamp}</span>
                  </div>
                  <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 leading-snug md:leading-relaxed line-clamp-2 md:line-clamp-none">{alert.description}</p>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="p-1 md:p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"
                  title={t('Dismiss')}
                >
                  <span className="material-icons-round text-base md:text-lg">close</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Middle Grid: Planner & Costs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Smart Crop Planner (Full width) */}
        <div className="lg:col-span-3 bg-white dark:bg-surface-dark rounded-xl md:rounded-[2rem] p-3 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-center mb-3 md:mb-6">
            <div>
              <h3 className="text-base md:text-xl font-bold text-slate-800 dark:text-white">{t('Smart Crop Planner')}</h3>
              <p className="text-sm text-slate-500">{t('Planner Subtitle')}</p>
            </div>
            <button className="p-2 rounded-xl bg-gray-50 dark:bg-gray-800 hover:text-primary transition-colors">
              <span className="material-icons-round">calendar_month</span>
            </button>
          </div>

          {cropTasks.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x">
              {cropTasks.map((task, i) => (
                <div key={i} className="min-w-[160px] md:min-w-[200px] bg-slate-50 dark:bg-slate-800/50 p-3 md:p-5 rounded-2xl md:rounded-3xl border border-slate-100 dark:border-slate-800 snap-start hover:border-primary/30 transition-colors cursor-pointer group">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{task.day}</span>
                    <div className="w-2 h-2 rounded-full bg-primary group-hover:animate-ping"></div>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-white mb-1 leading-tight">{task.task}</h4>
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-lg inline-block mt-2">{task.crop}</span>
                </div>
              ))}
              <div className="min-w-[150px] flex flex-col items-center justify-center p-5 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary hover:border-primary/50 cursor-pointer transition-all">
                <span className="material-icons-round text-3xl mb-2">add</span>
                <span className="text-xs font-bold uppercase">{t('Add Task')}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-50 dark:bg-gray-800/30 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
              <div className="w-16 h-16 bg-white dark:bg-surface-dark rounded-full flex items-center justify-center shadow-sm mb-4">
                <span className="material-icons-round text-3xl text-gray-300">event_note</span>
              </div>
              <h4 className="font-bold text-gray-900 dark:text-white mb-1">{t('No Active Plans')}</h4>
              <p className="text-sm text-gray-500 mb-6 max-w-sm">{t('No Plans Desc')}</p>
              <button
                onClick={() => onNavigate && onNavigate('scan' as any)}
                className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-[#345f30] transition-colors"
              >
                {t('Start New Scan')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* NER Tools — Jhum Advisory + ASHA mode (only ASHA users see ASHA card) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => onNavigate && onNavigate('jhum' as any)}
          className="text-left bg-gradient-to-br from-emerald-700 via-primary to-emerald-900 rounded-2xl md:rounded-[2rem] p-5 md:p-7 text-white relative overflow-hidden group hover:shadow-xl hover:shadow-primary/20 transition-all"
        >
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 backdrop-blur-sm">
              <span className="material-icons-round text-sm">forest</span>
              NER Agroforestry
            </div>
            <h3 className="text-lg md:text-xl font-extrabold mb-1">Jhum Rotation Advisory</h3>
            <p className="text-emerald-100/80 text-sm leading-snug max-w-md">
              Plan shifting cultivation cycles with slope-aware soil regeneration windows.
            </p>
            <div className="flex items-center gap-1 mt-3 text-xs font-bold opacity-90">
              Open advisory <span className="material-icons-round text-sm">arrow_forward</span>
            </div>
          </div>
        </button>

        {user?.role === 'ASHA' ? (
          <button
            onClick={() => onNavigate && onNavigate('asha' as any)}
            className="text-left bg-gradient-to-br from-rose-700 via-pink-700 to-rose-900 rounded-2xl md:rounded-[2rem] p-5 md:p-7 text-white relative overflow-hidden group hover:shadow-xl hover:shadow-rose-500/20 transition-all"
          >
            <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 backdrop-blur-sm">
                <span className="material-icons-round text-sm">health_and_safety</span>
                ASHA Field Mode
              </div>
              <h3 className="text-lg md:text-xl font-extrabold mb-1">District Disease Surveillance</h3>
              <p className="text-rose-100/80 text-sm leading-snug max-w-md">
                Aggregate field reports across NE districts. Submit and track outbreak hotspots.
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs font-bold opacity-90">
                Open dashboard <span className="material-icons-round text-sm">arrow_forward</span>
              </div>
            </div>
          </button>
        ) : (
          <div className="bg-white dark:bg-surface-dark rounded-2xl md:rounded-[2rem] p-5 md:p-7 border border-slate-100 dark:border-slate-800 relative overflow-hidden">
            <div className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3">
              <span className="material-icons-round text-sm">verified_user</span>
              ASHA Workers Only
            </div>
            <h3 className="text-lg md:text-xl font-extrabold text-slate-800 dark:text-white mb-1">District Disease Surveillance</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-snug max-w-md mb-4">
              ASHA workers can register a verified field-reporter account to submit anonymized outbreak reports across NE districts.
            </p>
            <button
              onClick={async () => {
                if (!user?.uid && !user?.id) {
                  toast.error('Login required');
                  return;
                }
                try {
                  const { firebaseService } = await import('../services/FirebaseService');
                  if (user.uid) {
                    await firebaseService.updateUser(user.uid, { role: 'ASHA' });
                  }
                  toast.success('ASHA mode activated — refresh the sidebar');
                  if (onNavigate) onNavigate('asha' as any);
                } catch (err) {
                  console.warn('Role update failed', err);
                  toast.error('Could not activate ASHA mode');
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-bold border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
            >
              <span className="material-icons-round text-sm">science</span>
              Activate demo ASHA mode
            </button>
          </div>
        )}
      </div>

      {/* Farming Tip - Full Width */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl md:rounded-[2rem] p-3 md:p-6 border border-indigo-100 dark:border-indigo-800 relative overflow-hidden group">
        <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform"></div>
        <div className="flex items-start gap-3 md:gap-5 relative z-10">
          <div className="p-2 md:p-3 bg-white dark:bg-indigo-900/50 rounded-xl md:rounded-2xl shadow-sm text-indigo-600 dark:text-indigo-400">
            <span className="material-icons-round text-2xl md:text-3xl">lightbulb</span>
          </div>
          <div>
            <h4 className="font-black text-indigo-900 dark:text-indigo-300 text-base md:text-lg mb-1 uppercase tracking-wider">{t('Farming Tip')}</h4>
            <p className="text-sm text-indigo-800/80 dark:text-indigo-400/80 leading-relaxed font-medium max-w-3xl">
              {t('TipContent')}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Diagnosis List - Full Width */}
      <div className="bg-white dark:bg-surface-dark rounded-xl md:rounded-[2rem] p-3 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3 md:mb-8">
          <h3 className="font-bold text-base md:text-xl text-slate-800 dark:text-white">{t('Recent Diagnosis')}</h3>
          <button onClick={() => onNavigate && onNavigate('history' as any)} className="text-primary text-sm font-bold hover:underline flex items-center gap-1">
            {t('View All')} <span className="material-icons-round text-sm">chevron_right</span>
          </button>
        </div>
        <div className="space-y-2 md:space-y-4">
          {recentDiagnosis.length === 0 ? (
            <div className="text-center py-8 md:py-10 text-gray-500">
              <p>{t('NoRecentScans')}</p>
              <button onClick={() => onNavigate && onNavigate('scan' as any)} className="text-primary font-bold mt-2">{t('StartScan')}</button>
            </div>
          ) : (
            recentDiagnosis.map((item) => (
              <div key={item.id} onClick={() => handleDiagnosisClick(item)} className="flex items-center gap-2.5 md:gap-5 p-2.5 md:p-5 rounded-xl md:rounded-3xl border border-slate-100 md:border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer group active:scale-[0.99]">
                <div className="w-12 h-12 md:w-20 md:h-20 rounded-lg md:rounded-2xl overflow-hidden shadow-sm md:shadow-md flex-shrink-0">
                  <img src={item.imageUrl} alt={item.diagnosis} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5 md:mb-1">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-[13px] md:text-lg truncate">{item.diagnosis}</h4>
                    <span className={`text-[9px] md:text-[10px] font-black uppercase px-2 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg shrink-0 ml-2 ${item.status === 'Critical' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                      {t(item.status)}
                    </span>
                  </div>
                  <p className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 font-medium">
                    {item.cropName} • <span className="text-primary font-bold">{item.confidence ? (item.confidence * 100).toFixed(0) : 90}%</span>
                    <span className="hidden md:inline"> • {item.date}</span>
                  </p>
                </div>
                <div className="hidden md:flex w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center text-slate-300 group-hover:bg-primary group-hover:text-white transition-all">
                  <span className="material-icons-round">chevron_right</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        user={user || undefined}
        onUpgrade={(updatedUser) => {
          setShowUpgradeModal(false);
          toast.success(t('Upgrade Success'));
          // App.tsx listener will handle actual state update, or we could pass a callback but UserDashboard doesn't explicitly have onUserUpdate
        }}
      />
    </div>
  );
};

export default UserDashboard;