import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { UserProfile } from '../types';
import { dbService } from '../services/DatabaseService';
import { firebaseService } from '../services/FirebaseService';
import { getTranslation } from '../utils/translations';
import UpgradeModal from '../components/UpgradeModal';
import ComingSoonModal from '../components/ComingSoonModal';

interface SettingsProps {
    language: string;
    setLanguage: (lang: string) => void;
    user: UserProfile | null;
    onUpdateUser: (updated: Partial<UserProfile>) => void;
    onLogout: () => void;
    isDark: boolean;
    toggleTheme: () => void;
}

const Settings: React.FC<SettingsProps> = ({ language, setLanguage, user, onUpdateUser, onLogout, isDark, toggleTheme }) => {
    const t = (key: string) => getTranslation(language, key);

    const [notifications, setNotifications] = useState({
        email: true,
        push: true,
        inApp: true
    });
    const [offlineMode, setOfflineMode] = useState(false);
    const [myCrops, setMyCrops] = useState<string[]>([]);
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [editName, setEditName] = useState('');
    const [editAvatar, setEditAvatar] = useState('');

    // Coming Soon State
    const [showComingSoon, setShowComingSoon] = useState(false);
    const [comingSoonFeature, setComingSoonFeature] = useState("");
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    useEffect(() => {
        const savedOffline = localStorage.getItem('offlineMode') === 'true';
        setOfflineMode(savedOffline);

        const savedNotifs = localStorage.getItem('notifications');
        if (savedNotifs) {
            setNotifications(JSON.parse(savedNotifs));
        }

        const savedCrops = localStorage.getItem('kropscan_my_crops');
        if (savedCrops) {
            try { setMyCrops(JSON.parse(savedCrops)); } catch { /* ignore */ }
        }
    }, []);

    const handleSaveNotifications = (key: string) => {
        const newNotifs = { ...notifications, [key]: !notifications[key as keyof typeof notifications] };
        setNotifications(newNotifs);
        localStorage.setItem('notifications', JSON.stringify(newNotifs));
    };

    const handleOfflineToggle = () => {
        // UI Pivot: Show Coming Soon instead of real logic
        setComingSoonFeature("Offline Mode");
        setShowComingSoon(true);
        setOfflineMode(false);
    };

    const handleClearCache = () => {
        if (confirm("Are you sure? This will reset local preferences.")) {
            localStorage.clear();
            sessionStorage.clear();
            toast.info("Cache cleared. Reloading...");
            window.location.reload();
        }
    };

    const handleDeleteAccount = async () => {
        if (confirm("CRITICAL WARNING: This will permanently delete your account and all data. This cannot be undone.")) {
            if (user?.id) {
                await dbService.deleteUser(user.id);
                onLogout();
            } else {
                toast.info("Guest account reset.");
                onLogout();
            }
        }
    };

    const availableCrops: { name: string; icon: string }[] = [
        { name: 'Wheat', icon: 'grass' },
        { name: 'Rice', icon: 'grass' },
        { name: 'Corn', icon: 'grass' },
        { name: 'Soybean', icon: 'grass' },
        { name: 'Cotton', icon: 'grass' },
        { name: 'Sugarcane', icon: 'grass' },
        { name: 'Tomato', icon: 'eco' },
        { name: 'Potato', icon: 'eco' },
        { name: 'Pepper', icon: 'eco' },
        { name: 'Mango', icon: 'park' },
        { name: 'Grape', icon: 'park' },
    ];

    const toggleCrop = (cropName: string) => {
        const updated = myCrops.includes(cropName)
            ? myCrops.filter(c => c !== cropName)
            : [...myCrops, cropName];
        setMyCrops(updated);
        localStorage.setItem('kropscan_my_crops', JSON.stringify(updated));
    };

    const openEditProfile = () => {
        setEditName(user?.name || '');
        setEditAvatar(user?.avatar || '');
        setIsEditProfileOpen(true);
    };

    const saveProfile = async () => {
        if (user?.id) {
            const updated = await dbService.updateUser(user.id, { name: editName, avatar: editAvatar });
            if (updated) onUpdateUser(updated);
        } else {
            onUpdateUser({ name: editName, avatar: editAvatar });
        }
        setIsEditProfileOpen(false);
    };

    const languages = [
        { code: 'en',  name: 'English' },
        { code: 'hi',  name: 'Hindi (हिंदी)' },
        { code: 'mr',  name: 'Marathi (मराठी)' },
        { code: 'pa',  name: 'Punjabi (ਪੰਜਾਬੀ)' },
        { code: 'te',  name: 'Telugu (తెలుగు)' },
        { code: 'ta',  name: 'Tamil (தமிழ்)' },
        { code: 'as',  name: 'Assamese (অসমীয়া)' },
        { code: 'bn',  name: 'Bengali (বাংলা)' },
        { code: 'gu',  name: 'Gujarati (ગુજરાતી)' },
        { code: 'kn',  name: 'Kannada (ಕನ್ನಡ)' },
        { code: 'ml',  name: 'Malayalam (മലയാളം)' },
        // NER tribal languages — auto-translated via Gemma at runtime
        { code: 'brx', name: 'Bodo (बड़ो)' },
        { code: 'lus', name: 'Mizo (Mizo ṭawng)' },
        { code: 'kha', name: 'Khasi (Ka Ktien Khasi)' },
        { code: 'mni', name: 'Manipuri (Meitei)' },
    ];

    const memberSince = (user as any)?.joinedDate ? new Date((user as any).joinedDate).getFullYear() : '2026';

    return (
        <div className="p-3 md:p-6 lg:p-10 max-w-4xl mx-auto space-y-4 md:space-y-8 animate-fade-in relative">
            <div>
                <h1 className="text-xl md:text-3xl font-black text-gray-900 dark:text-white mb-1 md:mb-2">{t('Settings')}</h1>
                <p className="text-xs md:text-base text-gray-500 dark:text-gray-400">{t('Manage preferences')}</p>
            </div>

            <div className="space-y-3 md:space-y-6">
                {/* Profile Section */}
                <div className="bg-white dark:bg-surface-dark p-4 md:p-6 lg:p-8 rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col md:flex-row items-center gap-4 md:gap-6">
                    <div className="relative group cursor-pointer" onClick={openEditProfile}>
                        <img src={user?.avatar || "https://i.pravatar.cc/150?u=placeholder"} alt="Profile" className="w-16 h-16 md:w-24 md:h-24 rounded-full object-cover border-4 border-gray-100 dark:border-gray-700 group-hover:opacity-80 transition-opacity" />
                        <button className="absolute bottom-0 right-0 p-1.5 md:p-2 bg-primary text-white rounded-full shadow-lg hover:scale-110 transition-transform min-w-[32px] min-h-[32px] flex items-center justify-center">
                            <span className="material-icons-round text-xs md:text-sm">edit</span>
                        </button>
                    </div>
                    <div className="text-center md:text-left flex-1">
                        <h3 className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white">{user?.name || 'Guest User'}</h3>
                        <p className="text-sm md:text-base text-gray-500 dark:text-gray-400 mb-1.5 md:mb-2">{user?.plan || 'Free Plan'}</p>
                        <div className="flex flex-wrap justify-center md:justify-start gap-1.5 md:gap-2">
                            <span className="px-2.5 md:px-3 py-0.5 md:py-1 bg-green-100 text-green-700 rounded-full text-[10px] md:text-xs font-bold">{t('Verified')}</span>
                            <span className="px-2.5 md:px-3 py-0.5 md:py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] md:text-xs font-bold">{t('Member since')} {memberSince}</span>
                        </div>
                    </div>
                    <button onClick={openEditProfile} className="w-full md:w-auto px-6 py-2.5 md:py-2 border border-gray-200 dark:border-gray-700 rounded-xl font-bold text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 text-sm md:text-base min-h-[44px]">
                        {t('Edit Profile')}
                    </button>
                </div>

                {/* General Settings */}
                <div className="bg-white dark:bg-surface-dark p-4 md:p-6 lg:p-8 rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800">
                    <div className="flex justify-between items-center mb-4 md:mb-6 gap-2">
                        <h3 className="text-base md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="material-icons-round text-primary text-xl md:text-2xl">tune</span> {t('General')}
                        </h3>
                        <button
                            onClick={() => {
                                const issue = prompt("Describe your issue:");
                                if (issue) {
                                    firebaseService.createTicket(user?.id || 0, user?.name || 'Guest', 'General Inquiry', issue);
                                    toast.success('Support ticket created! Admins will review it.');
                                }
                            }}
                            className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 px-3 md:px-4 py-2 rounded-xl text-[10px] md:text-xs font-bold transition-colors flex items-center gap-1.5 md:gap-2 min-h-[44px]"
                        >
                            <span className="material-icons-round text-sm">help</span> <span className="hidden sm:inline">{t('Contact Support')}</span><span className="sm:hidden">Help</span>
                        </button>
                    </div>

                    <div className="space-y-4 md:space-y-6">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-2 md:gap-4">
                            <div>
                                <label className="font-bold text-gray-900 dark:text-white block text-sm md:text-base">{t('App Language')}</label>
                                <p className="text-[10px] md:text-xs text-gray-500">{t('Select language')}</p>
                            </div>
                            <div className="relative">
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="w-full md:w-64 appearance-none px-3 md:px-4 py-2.5 md:py-3 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-bold text-sm md:text-base text-gray-700 dark:text-white focus:ring-2 focus:ring-primary/50 outline-none min-h-[44px]"
                                >
                                    {languages.map(lang => (
                                        <option key={lang.code} value={lang.name}>{lang.name}</option>
                                    ))}
                                </select>
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 material-icons-round text-gray-400 pointer-events-none">expand_more</span>
                            </div>
                        </div>

                        <div className="h-px bg-gray-100 dark:bg-gray-800"></div>

                        <div className="flex justify-between items-center gap-4">
                            <div>
                                <label className="font-bold text-gray-900 dark:text-white block text-sm md:text-base">{t('Dark Mode')}</label>
                                <p className="text-[10px] md:text-xs text-gray-500">{t('Toggle theme between light and dark')}</p>
                            </div>
                            <button
                                onClick={toggleTheme}
                                className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 flex-shrink-0 ${isDark ? 'bg-primary' : 'bg-gray-300'}`}
                            >
                                <div className={`w-6 h-6 rounded-full bg-white shadow-sm transform transition-transform duration-300 ${isDark ? 'translate-x-6' : 'translate-x-0'}`}></div>
                            </button>
                        </div>

                        <div className="h-px bg-gray-100 dark:bg-gray-800"></div>

                        <div className="flex justify-between items-center gap-4">
                            <div>
                                <label className="font-bold text-gray-900 dark:text-white block text-sm md:text-base">{t('Offline Mode')}</label>
                                <p className="text-[10px] md:text-xs text-gray-500">{t('Download models')}</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                <input type="checkbox" checked={offlineMode} onChange={handleOfflineToggle} className="sr-only peer" />
                                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* My Farm - Crop Portfolio */}
                <div className="bg-white dark:bg-surface-dark p-4 md:p-6 lg:p-8 rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800">
                    <div className="mb-4 md:mb-6">
                        <h3 className="text-base md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="material-icons-round text-primary text-xl md:text-2xl">agriculture</span> {t('My Farm')}
                        </h3>
                        <p className="text-[10px] md:text-xs text-gray-500 mt-1">{t('Select crops you grow')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:gap-3">
                        {availableCrops.map(crop => {
                            const selected = myCrops.includes(crop.name);
                            return (
                                <button
                                    key={crop.name}
                                    onClick={() => toggleCrop(crop.name)}
                                    className={`inline-flex items-center gap-1 md:gap-1.5 px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-bold transition-all min-h-[40px] ${
                                        selected
                                            ? 'bg-green-600 text-white shadow-md'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <span className="material-icons-round text-base">{crop.icon}</span>
                                    {t(crop.name)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Notifications */}
                <div className="bg-white dark:bg-surface-dark p-4 md:p-6 lg:p-8 rounded-2xl md:rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800">
                    <h3 className="text-base md:text-xl font-bold text-gray-900 dark:text-white mb-4 md:mb-6 flex items-center gap-2">
                        <span className="material-icons-round text-primary text-xl md:text-2xl">notifications</span> {t('Notifications')}
                    </h3>
                    <div className="space-y-3 md:space-y-4">
                        {[
                            { key: 'email', label: t('Email Alerts'), desc: t('Email Alerts Desc') },
                            { key: 'push', label: t('Push Notifications'), desc: t('Push Notifications Desc') },
                            { key: 'inApp', label: t('In-App Alerts'), desc: t('In-App Alerts Desc') }
                        ].map((item: any) => (
                            <div key={item.key} className="flex justify-between items-center py-1.5 md:py-2 gap-3">
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white text-sm md:text-base">{item.label}</p>
                                    <p className="text-[10px] md:text-xs text-gray-500">{item.desc}</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={notifications[item.key as keyof typeof notifications]}
                                        onChange={() => handleSaveNotifications(item.key)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Danger Zone */}
                <div className="bg-red-50 dark:bg-red-900/10 p-4 md:p-6 lg:p-8 rounded-2xl md:rounded-[2rem] border border-red-100 dark:border-red-900/30">
                    <h3 className="text-base md:text-xl font-bold text-red-600 mb-1.5 md:mb-2">{t('Danger Zone')}</h3>
                    <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-4 md:mb-6">{t('Danger Zone Desc')}</p>
                    <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
                        <button onClick={handleClearCache} className="px-5 md:px-6 py-2.5 bg-white dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-800 rounded-xl font-bold text-xs md:text-sm hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors min-h-[44px]">
                            {t('Clear Cache')}
                        </button>
                        <button onClick={handleDeleteAccount} className="px-5 md:px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold text-xs md:text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20 min-h-[44px]">
                            {t('Delete Account')}
                        </button>
                    </div>
                </div>

                {/* Logout Button */}
                <div className="flex justify-center pt-2 md:pt-4">
                    <button onClick={onLogout} className="w-full sm:w-auto px-10 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-bold shadow-xl hover:scale-105 transition-transform flex items-center justify-center gap-2 text-sm md:text-base min-h-[48px]">
                        <span className="material-icons-round">logout</span>
                        {t('Logout')}
                    </button>
                </div>

                {/* Edit Profile Modal */}
                {isEditProfileOpen && (
                    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setIsEditProfileOpen(false)}>
                        <div className="bg-white dark:bg-surface-dark w-full max-w-md rounded-t-2xl md:rounded-[2.5rem] p-5 md:p-8 shadow-2xl relative animate-scale-up" onClick={e => e.stopPropagation()}>
                            <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-gray-900 dark:text-white">{t('Edit Profile')}</h2>

                            <div className="space-y-4">
                                <div className="flex justify-center mb-6">
                                    <div className="relative">
                                        <img src={editAvatar || "https://i.pravatar.cc/150?u=placeholder"} className="w-24 h-24 rounded-full object-cover border-4 border-gray-100 dark:border-gray-700" alt="Avatar Preview" />
                                        <span className="absolute bottom-0 right-0 p-1 bg-gray-200 rounded-full material-icons-round text-sm text-black">edit</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold mb-2 text-gray-700 dark:text-gray-300">{t('Display Name')}</label>
                                    <input
                                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-bold text-gray-900 dark:text-white"
                                        value={editName} onChange={e => setEditName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold mb-2 text-gray-700 dark:text-gray-300">{t('Avatar URL')}</label>
                                    <input
                                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                                        value={editAvatar} onChange={e => setEditAvatar(e.target.value)}
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div className="mt-8 flex justify-end gap-3">
                                <button onClick={() => setIsEditProfileOpen(false)} className="px-5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold">{t('Cancel')}</button>
                                <button onClick={saveProfile} className="px-5 py-2 rounded-xl bg-primary text-white font-bold shadow-lg hover:bg-green-700 transition-colors">{t('Save Changes')}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Coming Soon Modal */}
                <ComingSoonModal
                    isOpen={showComingSoon}
                    onClose={() => setShowComingSoon(false)}
                    featureName={comingSoonFeature}
                />

                {/* Upgrade Modal */}
                {showUpgradeModal && (
                    <UpgradeModal
                        isOpen={showUpgradeModal}
                        onClose={() => setShowUpgradeModal(false)}
                        user={user}
                        onUpgrade={() => setShowUpgradeModal(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default Settings;