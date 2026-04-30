import { dbService } from './DatabaseService';
import { firebaseService } from './FirebaseService';
import { UserProfile, SubscriptionTier } from '../types';

export const PLANS = {
    FREE: {
        name: 'Free',
        price: 0,
        features: ['5 Scans/Day', 'Full Treatment Advice', 'Community & Marketplace', 'Live Mandi Prices', 'Learning Center', 'Offline AI Detection']
    },
    PREMIUM: {
        name: 'Pro Kisan',
        price: 49,
        features: ['Unlimited Scans', 'Cloud-Verified Diagnosis', 'Unlimited KropBot Chat', 'AI Market Signals & Price Alerts', 'Unlimited Scan History', 'PDF Export & Verified Badge']
    },
    ENTERPRISE: {
        name: 'Enterprise',
        price: 4999,
        features: ['Everything in Pro', 'Regional Analytics', 'Team Management', 'API Access', 'Dedicated Support']
    }
};

class SubscriptionService {

    // Use Firebase for upgrades
    async upgradeUser(user: UserProfile, tier: SubscriptionTier): Promise<{ success: boolean; user?: UserProfile }> {
        console.log(`Processing mock payment for ${tier} tier...`);

        return new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    // 1. Identify User ID type (Firebase vs Local)
                    const userId = user.uid || (typeof user.id === 'string' ? user.id : null);

                    if (userId) {
                        // Cloud User
                        const success = await firebaseService.upgradeUserPlan(userId, tier);
                        if (success) {
                            resolve({ success: true, user: { ...user, plan: tier } });
                        } else {
                            resolve({ success: false });
                        }
                    } else if (typeof user.id === 'number') {
                        // Local/Legacy User
                        await dbService.upgradeUserToPro(user.id);
                        resolve({ success: true, user: { ...user, plan: tier } });
                    } else {
                        console.error("Upgrade failed: No valid ID found for user", user);
                        resolve({ success: false });
                    }
                } catch (e) {
                    console.error("Upgrade process error:", e);
                    resolve({ success: false });
                }
            }, 1000);
        });
    }

    // Removed local storage usage. Usage is now tracked on the User object in Firestore.
    // getUsage is deprecated in favor of checking user.scansCount directly in checkLimit

    incrementUsage(type: 'scans' | 'chat', user?: UserProfile | null): void {
        if (!user || !user.uid) return;
        if (type === 'scans') {
            firebaseService.incrementUserScanCount(user.uid);
        } else if (type === 'chat') {
            firebaseService.incrementUserChatCount(user.uid);
        }
    }

    checkLimit(user: UserProfile | null | undefined, type: 'scans' | 'chat'): { allowed: boolean; remaining: number; limit: number } {
        if (!user) {
            return { allowed: false, remaining: 0, limit: 0 };
        }

        // Admins/Org/Enterprise/Premium bypass limits
        const isPremiumOrEnterprise = ['ADMIN', 'ORGANIZATION'].includes(user.role || '') ||
            ['PREMIUM', 'ENTERPRISE', PLANS.PREMIUM.name, PLANS.ENTERPRISE.name, 'Pro Farmer', 'Enterprise'].includes(user.plan || '');

        if (isPremiumOrEnterprise) {
            return { allowed: true, remaining: 9999, limit: 9999 };
        }

        let limit = 0;
        let usage = 0;
        const today = new Date().setHours(0, 0, 0, 0);

        if (type === 'scans') {
            limit = 5; // Free daily scans
            usage = (user as any).scansCount || 0;
            const lastScan = (user as any).lastScanDate || 0;
            if (lastScan < today) usage = 0;
        }

        if (type === 'chat') {
            limit = 5;  // Free daily chat messages
            usage = (user as any).chatCount || 0;
            const lastChat = (user as any).lastChatDate || 0;
            if (lastChat < today) usage = 0;
        }

        return {
            allowed: usage < limit,
            remaining: Math.max(0, limit - usage),
            limit
        };
    }

    checkFeatureAccess(user: UserProfile | null | undefined, feature: 'advanced_treatment' | 'soil_analysis' | 'market_forecast'): boolean {
        if (!user) return false;

        // Treatment advice is FREE for everyone — never paywall medicine
        if (feature === 'advanced_treatment') return true;

        if (user.role === 'ADMIN' || user.role === 'ORGANIZATION') return true;
        if (['PREMIUM', 'ENTERPRISE', PLANS.PREMIUM.name, 'Pro Kisan', PLANS.ENTERPRISE.name].includes(user.plan || '')) return true;

        // Only market_forecast and soil_analysis are Pro features
        return false;
    }

    // Aliases for AiBot compatibility
    checkChatLimit(user: UserProfile | null | undefined): { allowed: boolean; remaining: number } {
        return this.checkLimit(user, 'chat');
    }

    async incrementChatCount(user: UserProfile | null | undefined): Promise<void> {
        this.incrementUsage('chat', user);
    }
}

export const subscriptionService = new SubscriptionService();
