import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { UserRole, CropScan } from '../types';
import { firebaseService } from './FirebaseService';

export interface User {
    id?: number;
    name: string;
    email?: string;
    mobile?: string;
    password?: string; // specific to local auth
    role: UserRole;
    avatar?: string;
    plan?: string;
    planExpiry?: number; // Added expiry timestamp
    joinedDate: number;
}

export interface Report extends CropScan {
    userId: number; // Foreign key to User
    timestamp: number;
}

interface KropScanDB extends DBSchema {
    users: {
        key: number;
        value: User;
        indexes: { 'by-email': string; 'by-mobile': string };
    };
    reports: {
        key: number; // Changed from string 'id' in CropScan to number for autoIncrement, will map back
        value: Report; // We will omit 'id' when inserting
        indexes: { 'by-user': number, 'by-date': number };
    };
    posts: {
        key: number;
        value: {
            id?: number;
            author: string;
            role: string;
            avatar: string;
            time: string;
            content: string;
            likes: number;
            comments: number;
            tags: string[];
            image: string | null;
            timestamp: number;
        };
        indexes: { 'by-timestamp': number };
    };
    market_items: {
        key: number;
        value: {
            id?: number;
            title: string;
            price: number;
            description: string;
            image: string;
            sellerId: number;
            sellerName: string;
            category: string;
            timestamp: number;
            status?: string;
        };
        indexes: { 'by-timestamp': number; 'by-status': string };
    };
    articles: {
        key: number;
        value: {
            id?: number;
            title: string;
            category: string;
            readTime: string;
            image: string;
            type: 'Article' | 'Video';
            content: string;
            timestamp: number;
        };
        indexes: { 'by-timestamp': number };
    };
    tokens: {
        key: string;
        value: {
            token: string;
            userId: number;
            expiry: number;
        };
        indexes: { 'by-user': number, 'by-expiry': number };
    };
    daily_prices: {
        key: string;
        value: {
            crop: string;
            price: number;
            trend: string;
        };
    };
    tickets: {
        key: number;
        value: {
            id?: number;
            userId: number;
            userName: string;
            title: string;
            description: string;
            status: 'Open' | 'Resolved';
            timestamp: number;
        };
        indexes: { 'by-user': number; 'by-status': string; 'by-timestamp': number };
    };
    notifications: {
        key: number;
        value: {
            id?: number;
            title: string;
            message: string;
            type: 'info' | 'alert' | 'warning';
            timestamp: number;
            expiresAt?: number;
        };
        indexes: { 'by-timestamp': number };
    };
    affiliate_products: {
        key: number;
        value: {
            id?: number;
            name: string;
            category: string;
            image: string;
            price: number;
            rating: number;
            affiliateLink: string;
            commission: number;
            timestamp: number;
        };
        indexes: { 'by-category': string };
    };
    commission_events: {
        key: number;
        value: {
            id?: number;
            productId: number;
            userId?: number;
            timestamp: number;
        };
        indexes: { 'by-product': number; 'by-user': number };
    };
}

class DatabaseService {
    private dbPromise: Promise<IDBPDatabase<KropScanDB>>;

    // --- Versioning and Initialization ---

    constructor() {
        // Bump to version 10 for Affiliate & Fixes
        this.dbPromise = openDB<KropScanDB>('kropscan-db', 10, {
            upgrade(db, oldVersion, newVersion, transaction) {
                // Version 1 only had posts
                if (oldVersion < 1) {
                    const store = db.createObjectStore('posts', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('by-timestamp', 'timestamp');
                }

                // Ensure 'users' store exists
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
                    userStore.createIndex('by-email', 'email', { unique: true });
                    userStore.createIndex('by-mobile', 'mobile', { unique: false });
                }

                // Ensure 'reports' store exists
                if (!db.objectStoreNames.contains('reports')) {
                    const reportStore = db.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
                    reportStore.createIndex('by-user', 'userId');
                    reportStore.createIndex('by-date', 'timestamp');
                }

                // Ensure 'articles' store
                if (!db.objectStoreNames.contains('articles')) {
                    const articleStore = db.createObjectStore('articles', { keyPath: 'id', autoIncrement: true });
                    articleStore.createIndex('by-timestamp', 'timestamp');
                }

                // Ensure 'market_items' store
                if (!db.objectStoreNames.contains('market_items')) {
                    const marketStore = db.createObjectStore('market_items', { keyPath: 'id', autoIncrement: true });
                    marketStore.createIndex('by-timestamp', 'timestamp');
                    marketStore.createIndex('by-status', 'status');
                }

                // Ensure 'tokens' store
                if (!db.objectStoreNames.contains('tokens')) {
                    const tokenStore = db.createObjectStore('tokens', { keyPath: 'token' });
                    tokenStore.createIndex('by-user', 'userId');
                    tokenStore.createIndex('by-expiry', 'expiry');
                }

                // Ensure 'daily_prices' (v8)
                if (!db.objectStoreNames.contains('daily_prices')) {
                    db.createObjectStore('daily_prices', { keyPath: 'crop' });
                }

                // --- v9: Support & Broadcasts ---
                if (!db.objectStoreNames.contains('tickets')) {
                    const ticketStore = db.createObjectStore('tickets', { keyPath: 'id', autoIncrement: true });
                    ticketStore.createIndex('by-user', 'userId');
                    ticketStore.createIndex('by-status', 'status');
                    ticketStore.createIndex('by-timestamp', 'timestamp');
                }

                if (!db.objectStoreNames.contains('notifications')) {
                    const notifStore = db.createObjectStore('notifications', { keyPath: 'id', autoIncrement: true });
                    notifStore.createIndex('by-timestamp', 'timestamp');
                }

                // --- v10: Affiliate System ---
                if (!db.objectStoreNames.contains('affiliate_products')) {
                    const affStore = db.createObjectStore('affiliate_products', { keyPath: 'id', autoIncrement: true });
                    affStore.createIndex('by-category', 'category');
                }

                if (!db.objectStoreNames.contains('commission_events')) {
                    const commStore = db.createObjectStore('commission_events', { keyPath: 'id', autoIncrement: true });
                    commStore.createIndex('by-product', 'productId');
                    commStore.createIndex('by-user', 'userId');
                }

                // Fix missing indices for existing stores (Migration Check)
                if (db.objectStoreNames.contains('users')) {
                    const userStore = transaction.objectStore('users');
                    if (!userStore.indexNames.contains('by-mobile')) {
                        userStore.createIndex('by-mobile', 'mobile', { unique: false });
                    }
                }

                // Fix missing 'by-status' index for market_items (v8 migration fix)
                if (db.objectStoreNames.contains('market_items')) {
                    const marketStore = transaction.objectStore('market_items');
                    if (!marketStore.indexNames.contains('by-status')) {
                        marketStore.createIndex('by-status', 'status');
                    }
                }
            },

            blocked() {
                console.warn("Database update blocked! Please close all other tabs and reload.");
                // alert("Database update blocked! Please close all other tabs and reload.");
            },
            blocking() {
                console.warn("New version available. Please reload this page.");
                // alert("New version available. Please reload this page.");
            },
            terminated() {
                console.error("Database connection failed");
            }
        });
    }

    private async getDb(): Promise<IDBPDatabase<KropScanDB>> {
        // Timeout race to prevent infinite hanging
        const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Database connection timed out. Please reload.")), 5000)
        );
        return Promise.race([this.dbPromise, timeout]);
    }

    // --- Authentication ---

    private otpStore = new Map<string, string>();

    async registerUser(name: string, mobile: string, email: string, role: UserRole = 'USER'): Promise<{ success: boolean; message?: string; user?: User }> {
        try {
            const db = await this.getDb();

            // Check if mobile exists
            const existingUserMobile = await db.getFromIndex('users', 'by-mobile', mobile);
            if (existingUserMobile) {
                return { success: false, message: 'Mobile number already registered.' };
            }
            // ... rest of register logic
            // Check if email exists (optional, keeping for legacy/completeness)
            if (email) {
                const existingUserEmail = await db.getFromIndex('users', 'by-email', email);
                if (existingUserEmail) {
                    return { success: false, message: 'Email already registered.' };
                }
            }

            const newUser: User = {
                name,
                mobile,
                role,
                avatar: `https://i.pravatar.cc/150?u=${name.replace(/\s+/g, '')}`,
                // FORCE 'Free' plan for new normal users. Admins get Enterprise.
                plan: role === 'ADMIN' ? 'Enterprise' : 'Free',
                // No expiry for free/enterprise for now, or enterprise could handle differently
                joinedDate: Date.now(),
            };

            if (email) {
                newUser.email = email;
            }

            const id = await db.add('users', newUser);
            return { success: true, user: { ...newUser, id } };
        } catch (e: any) {
            console.error("Register Error:", e);
            return { success: false, message: e.message || "Database Error" };
        }
    }

    async generateOtp(mobile: string): Promise<string> {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        this.otpStore.set(mobile, otp);

        // Auto-expire OTP in 5 mins (optional cleanup)
        setTimeout(() => this.otpStore.delete(mobile), 300000);

        return otp;
    }

    // Login with Mobile and OTP
    async loginUserWithMobile(mobile: string): Promise<{ success: boolean; message?: string; user?: User; requiresOtp?: boolean; otp?: string }> {
        try {
            const db = await this.getDb();
            const user = await db.getFromIndex('users', 'by-mobile', mobile);

            if (!user) {
                return { success: false, message: 'User not found.' };
            }

            const otp = await this.generateOtp(mobile);
            return { success: true, requiresOtp: true, user, otp };
        } catch (e: any) {
            console.error("Login Error:", e);
            return { success: false, message: e.message || "Database connection failure" };
        }
    }

    // Verify OTP
    async verifyOtp(mobile: string, otp: string): Promise<{ success: boolean; message?: string; user?: User }> {
        const db = await this.dbPromise;

        const storedOtp = this.otpStore.get(mobile);
        if (!storedOtp || storedOtp !== otp) {
            return { success: false, message: 'Invalid or expired OTP' };
        }

        // OTP is valid. Now check if user exists, but don't fail if they don't (for registration).
        const user = await db.getFromIndex('users', 'by-mobile', mobile);

        // Clear OTP after successful use
        this.otpStore.delete(mobile);

        return { success: true, user };
    }

    // Create Long-Lived Session Token
    async createSession(userId: number): Promise<string> {
        const db = await this.dbPromise;
        // Generate a random token
        const token = crypto.randomUUID();
        const expiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days

        await db.add('tokens', {
            token,
            userId,
            expiry
        });

        return token;
    }

    // Validate Session Token & Check Subscription Status
    async validateSession(token: string): Promise<User | null> {
        const db = await this.dbPromise;
        const session = await db.get('tokens', token);

        if (!session) return null;

        if (Date.now() > session.expiry) {
            await db.delete('tokens', token);
            return null;
        }

        const user = await db.get('users', session.userId);
        if (!user) return null;

        // Auto-Downgrade if Plan Expired
        if (user.plan !== 'Free' && user.planExpiry && Date.now() > user.planExpiry) {
            console.log(`[Subscription] User ${user.name}'s plan expired. Reverting to Free.`);

            // Downgrade
            user.plan = 'Free';
            user.planExpiry = undefined;
            await db.put('users', user);

            // Optional: Notify
            // await this.addNotification(user.id, "Plan Expired", "Your mock Pro plan has expired.");
        }

        return user;
    }

    async upgradeUserToPro(userId: number, durationDays: number = 30) {
        const db = await this.dbPromise;
        const user = await db.get('users', userId);
        if (user) {
            user.plan = 'Pro Farmer';
            user.planExpiry = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
            await db.put('users', user);
        }
    }

    async removeSession(token: string): Promise<void> {
        const db = await this.dbPromise;
        await db.delete('tokens', token);
    }

    async updateUser(id: number, updates: Partial<User>): Promise<User | null> {
        const db = await this.dbPromise;
        const user = await db.get('users', id);
        if (!user) return null;

        const updatedUser = { ...user, ...updates };
        await db.put('users', updatedUser);
        return updatedUser;
    }

    async deleteUser(id: number): Promise<boolean> {
        const db = await this.dbPromise;
        try {
            await db.delete('users', id);
            return true;
        } catch (e) {
            return false;
        }
    }

    async getUsers(): Promise<User[]> {
        const db = await this.dbPromise;
        return await db.getAll('users');
    }

    // --- Reports ---

    async saveReport(report: Omit<Report, 'id'>): Promise<{ success: boolean; id?: number }> {
        const db = await this.dbPromise;
        try {
            // 1. Save Local (Offline backup / Immediate Access)
            const localId = await db.add('reports', report as any);

            // 2. Sync to Cloud (Fire & Forget or Await)
            await firebaseService.addReport({
                ...report,
                localId // Link back just in case
            });

            return { success: true, id: localId };
        } catch (error) {
            console.error(error);
            return { success: false };
        }
    }

    async getUserReports(userId: number): Promise<CropScan[]> {
        const db = await this.dbPromise;
        const reports = await db.getAllFromIndex('reports', 'by-user', userId);

        return reports.map(r => ({
            ...r,
            id: r.id!.toString(),
        })).sort((a, b) => b.timestamp - a.timestamp);
    }

    async deleteReport(id: number): Promise<boolean> {
        const db = await this.dbPromise;
        try {
            await db.delete('reports', id);
            return true;
        } catch (e) {
            console.error("Failed to delete report", e);
            return false;
        }
    }

    // --- Market Items ---

    async addMarketItem(item: any) {
        const db = await this.dbPromise;
        await db.add('market_items', {
            ...item,
            timestamp: Date.now()
        });
    }

    async getMarketItems(includeAll: boolean = false) {
        const db = await this.dbPromise;
        const items = await db.getAllFromIndex('market_items', 'by-timestamp');
        const reversed = items.reverse();
        if (includeAll) return reversed;
        return reversed.filter(i => i.status === 'approved' || i.status === undefined);
    }

    async updateMarketItemStatus(id: number, status: string) {
        const db = await this.dbPromise;
        const item = await db.get('market_items', id);
        if (item) {
            item.status = status;
            await db.put('market_items', item);
        }
    }

    async deleteMarketItem(id: number) {
        const db = await this.dbPromise;
        await db.delete('market_items', id);
    }

    // --- Daily Prices (Admin Control) ---

    async getDailyPrices() {
        // Safe check for store existence in case of old DB version
        const db = await this.dbPromise;
        if (!db.objectStoreNames.contains('daily_prices')) return [];
        return await db.getAll('daily_prices');
    }

    async setDailyPrice(priceData: { crop: string; price: number; trend: number }) {
        const db = await this.dbPromise;
        if (!db.objectStoreNames.contains('daily_prices')) return;

        await db.put('daily_prices', {
            crop: priceData.crop, // key
            price: priceData.price,
            trend: priceData.trend.toString() // stored as string in interface, converting
        });
    }

    // --- Posts (Existing) ---

    async addPost(content: string, author: string, image: string | null = null) {
        const db = await this.dbPromise;
        await db.add('posts', {
            author,
            role: 'Farmer',
            avatar: `https://i.pravatar.cc/150?u=${Math.random()}`,
            time: 'Just now',
            content,
            likes: 0,
            comments: 0,
            tags: ['General'],
            image,
            timestamp: Date.now(),
        });
    }

    async getPosts() {
        const db = await this.dbPromise;
        const posts = await db.getAllFromIndex('posts', 'by-timestamp');
        return posts.reverse();
    }

    // --- Articles ---

    async addArticle(article: any) {
        const db = await this.dbPromise;
        await db.add('articles', {
            ...article,
            timestamp: Date.now()
        });
    }

    async getArticles() {
        const db = await this.dbPromise;
        const articles = await db.getAllFromIndex('articles', 'by-timestamp');
        return articles.reverse();
    }

    // --- Affiliate Marketplace (Cloud) ---

    async getAffiliateProducts() {
        // Delegate to Firebase for real inventory
        return await firebaseService.getAffiliateProducts();
    }

    async trackAffiliateClick(productId: number, userId?: number) {
        // Log locally
        const db = await this.dbPromise;
        console.log(`[Commission] User ${userId || 'Guest'} clicked product ${productId}. Revenue recorded.`);
        await db.add('commission_events', {
            productId,
            userId,
            timestamp: Date.now()
        });
    }

    // --- Admin / Generic Access ---

    async getStoreNames(): Promise<string[]> {
        const db = await this.dbPromise;
        return Array.from(db.objectStoreNames);
    }

    async getAllFromStore(storeName: string): Promise<any[]> {
        const db = await this.dbPromise;
        if (!db.objectStoreNames.contains(storeName as any)) return [];
        return await db.getAll(storeName as any);
    }

    async updateItemInStore(storeName: string, item: any): Promise<void> {
        const db = await this.dbPromise;
        if (!db.objectStoreNames.contains(storeName as any)) return;
        await db.put(storeName as any, item);
    }

    async deleteItemFromStore(storeName: string, key: any): Promise<void> {
        const db = await this.dbPromise;
        if (!db.objectStoreNames.contains(storeName as any)) return;
        await db.delete(storeName as any, key);
    }

    async broadcastMessage(title: string, message: string, type: 'info' | 'alert' | 'warning', durationHours: number = 24) {
        // Delegate to Cloud so ALL users receive it
        await firebaseService.broadcastMessage(title, message, type);
    }

    // --- Admin Stats Helpers ---

    async getAllReports(): Promise<CropScan[]> {
        const db = await this.dbPromise;
        const reports = await db.getAllFromIndex('reports', 'by-date');
        return reports.map(r => ({ ...r, id: r.id!.toString() })).reverse();
    }

    async getAdminStats(): Promise<{ totalUsers: number, totalScans: number, recentActivity: any[], activityTrend: any[] }> {
        // Delegate to Cloud for Global Stats
        try {
            return await firebaseService.getAdminStats();
        } catch (e) {
            console.warn("Cloud stats failed, falling back to local");
            // Fallback to local logic below...
        }

        const db = await this.dbPromise;
        const userCount = await db.count('users');
        const reportCount = await db.count('reports');

        // Get recent mixed activity (scans + new users) - approximate for demo
        const recentReports = await this.getAllReports();

        // Calculate Activity Trend (Last 7 Days)
        const activityTrend = [];
        const now = new Date();
        const allUsers = await db.getAll('users');
        const allReports = await db.getAll('reports');

        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const nextDate = new Date(date);
            nextDate.setDate(date.getDate() + 1);

            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

            const usersJoined = allUsers.filter(u => u.joinedDate >= date.getTime() && u.joinedDate < nextDate.getTime()).length;
            const scansPerformed = allReports.filter(r => r.timestamp >= date.getTime() && r.timestamp < nextDate.getTime()).length;

            activityTrend.push({
                name: dayName,
                users: usersJoined,
                scans: scansPerformed
            });
        }

        // Mix recent activity
        // We want a unified list of { type: 'scan' | 'user' | 'alert', ...data }
        const recentMixed = [];

        // Add Reports
        for (const r of recentReports) {
            recentMixed.push({
                type: 'scan',
                timestamp: (r as any).timestamp,
                diagnosis: r.diagnosis,
                cropName: r.cropName,
                id: r.id
            });
        }

        // Add Recent Users
        const recentUsers = await db.getAllFromIndex('users', 'by-mobile'); // approximate, just get all and sort
        // Actually better to just filter the allUsers we already have
        allUsers.sort((a, b) => b.joinedDate - a.joinedDate).slice(0, 5).forEach(u => {
            recentMixed.push({
                type: 'user',
                timestamp: u.joinedDate,
                title: 'New User Joined',
                message: `${u.name} joined KropScan`,
                id: u.id
            });
        });

        // Add Notifications
        if (db.objectStoreNames.contains('notifications')) {
            const notifs = await db.getAllFromIndex('notifications', 'by-timestamp');
            notifs.reverse().slice(0, 5).forEach(n => {
                recentMixed.push({
                    type: 'notification',
                    timestamp: n.timestamp,
                    title: n.title,
                    message: n.message,
                    id: n.id
                });
            });
        }

        // Sort combined list by timestamp desc
        recentMixed.sort((a, b) => b.timestamp - a.timestamp);

        // Limit to top 5
        return {
            totalUsers: userCount,
            totalScans: reportCount,
            recentActivity: recentMixed.slice(0, 10),
            activityTrend
        };
    }
}

export const dbService = new DatabaseService();
