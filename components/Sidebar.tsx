import React, { useState } from 'react';
import { NavItem, UserRole, UserProfile } from '../types';
import UpgradeModal from './UpgradeModal';

interface SidebarProps {
  activeTab: NavItem;
  setActiveTab: (tab: NavItem) => void;
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  t: (key: string) => string;
  language?: string; // Force re-render on language change
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, user, isOpen, onClose, t, language }) => {
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const adminItems: { id: NavItem; icon: string; label: string }[] = [
    { id: 'dashboard', icon: 'dashboard', label: 'System Health' },
    { id: 'market', icon: 'trending_up', label: 'Global Market' },
    { id: 'community', icon: 'hub', label: 'Nodes & Clusters' },
    { id: 'admin_db', icon: 'storage', label: 'Database Editor' },
    { id: 'settings', icon: 'settings', label: t('System Settings') },
  ];

  const userItems: { id: NavItem; icon: string; label: string }[] = [
    { id: 'dashboard', icon: 'space_dashboard', label: t('Overview') },
    { id: 'scan', icon: 'qr_code_scanner', label: t('New Scan') },
    { id: 'chatbot', icon: 'smart_toy', label: t('KropBot AI') },
    { id: 'history', icon: 'history', label: t('My Reports') },
    { id: 'market', icon: 'storefront', label: t('Market Prices') },
    { id: 'knowledge', icon: 'local_library', label: t('Learning Center') },
    { id: 'community', icon: 'forum', label: t('Community') },
    { id: 'jhum', icon: 'forest', label: 'Jhum Advisory' },
  ];

  const ashaItems: { id: NavItem; icon: string; label: string }[] = [
    { id: 'asha', icon: 'health_and_safety', label: 'ASHA Field Mode' },
    ...userItems
  ];

  const navItems = user.role === 'ADMIN'
    ? adminItems
    : user.role === 'ASHA'
      ? ashaItems
      : userItems;

  return (
    <>
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        user={user}
        onUpgrade={(updatedUser) => {
          setIsUpgradeModalOpen(false);
          // Optimistically update local state if possible, but Sidebar is pure props usually.
          // App.tsx handles the actual listener update so just closing is fine.
          alert("Upgrade Successful! Welcome to Pro.");
        }}
      />

      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-surface-light dark:bg-surface-dark border-r border-gray-100 dark:border-gray-800 flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 lg:static ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-800 rounded-full lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center z-10 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <span className="material-icons-round text-gray-600 dark:text-gray-300">close</span>
        </button>

        <div className="h-20 lg:h-24 flex items-center px-6 lg:px-8 flex-shrink-0">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-primary/10 rounded-[1.25rem] flex items-center justify-center text-primary mr-3">
            <span className="material-icons-round text-2xl lg:text-3xl">eco</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xl lg:text-2xl font-black tracking-tight text-gray-900 dark:text-white">KropScan</span>
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">{user.role === 'ADMIN' ? 'Control Unit' : ''}</span>
          </div>
        </div>

        <nav className="py-3 lg:py-4 px-3 lg:px-4 space-y-1 lg:space-y-2 overflow-y-auto custom-scrollbar flex-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                onClose();
              }}
              className={`w-full flex items-center gap-3 lg:gap-4 px-4 lg:px-5 py-3.5 lg:py-4 rounded-2xl transition-all group min-h-[48px] ${activeTab === item.id
                ? 'bg-primary text-white shadow-xl shadow-primary/30 dark:shadow-[0_0_15px_rgba(101,163,13,0.5)] font-bold'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white font-semibold'
                }`}
            >
              <span className={`material-icons-round text-xl lg:text-2xl ${activeTab === item.id ? 'text-white' : 'text-gray-400 group-hover:text-primary transition-colors'}`}>
                {item.icon}
              </span>
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        {user.role === 'USER' && !['Pro Farmer', 'Pro Kisan', 'PREMIUM', 'ENTERPRISE'].includes(user.plan || '') && (
          <div className="mx-4 lg:mx-6 mb-4 lg:mb-6 p-4 lg:p-6 bg-gradient-to-br from-secondary to-primary rounded-2xl lg:rounded-[2rem] text-white relative overflow-hidden shadow-xl shadow-primary/10 flex-shrink-0">
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">{t('Upgrade')}</p>
            <p className="text-sm font-bold leading-tight mb-3 lg:mb-4">{t('Unlock Expert')}</p>
            <button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="w-full py-2.5 bg-white text-primary rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors min-h-[44px]"
            >
              {t('Go Premium')}
            </button>
          </div>
        )}

        <div className="p-4 lg:p-6 border-t border-gray-50 dark:border-gray-800 flex-shrink-0">
          <button onClick={() => { setActiveTab('settings'); onClose(); }} className="flex items-center gap-3 lg:gap-4 w-full group min-h-[48px]">
            <img alt="User" className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl border-2 border-white dark:border-gray-700 shadow-sm object-cover" src={user.avatar} />
            <div className="text-left overflow-hidden flex-1">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{user.name}</p>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{user.plan}</p>
            </div>
            <span className="material-icons-round text-gray-300 ml-auto group-hover:text-primary transition-colors">settings</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;