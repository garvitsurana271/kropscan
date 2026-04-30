import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInWithPhoneNumber,
    RecaptchaVerifier,
    ConfirmationResult,
    ParsedToken,
    User as FirebaseUser,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
} from 'firebase/auth';
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy,
    doc,
    setDoc,
    onSnapshot,
    updateDoc,
    deleteDoc,
    limit,
    getDoc,
    startAfter,
    QueryDocumentSnapshot,
    increment,
    arrayUnion,
    arrayRemove
} from 'firebase/firestore';

// Firebase web config. Web API keys are designed to be public-safe — they identify
// the project, real security comes from Firestore rules. Inline config keeps the
// demo working out-of-the-box without env-var setup.
const firebaseConfig = {
    apiKey: "AIzaSyDgg-CREwoxHU30GaZNZ3DlzFJT9npO4Ng",
    authDomain: "kropscan-528c9.firebaseapp.com",
    projectId: "kropscan-528c9",
    storageBucket: "kropscan-528c9.firebasestorage.app",
    messagingSenderId: "221291861950",
    appId: "1:221291861950:web:78bd04d660356058460bef",
    measurementId: "G-KZS3E7MNN6"
};

export interface Post {
    id: string;
    content: string;
    author: string;
    avatar: string;
    image?: string;
    timestamp: number;
    likes: number;
    likedBy: string[];
    comments: number;
    [key: string]: any;
}

class FirebaseService {
    app;
    auth;
    db;
    confirmationResult: ConfirmationResult | null = null;

    constructor() {
        // Initialize Firebase
        // Check if config is present to avoid crash on empty start
        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn("Firebase Config missing! Add credentials to .env");
        }
        this.app = initializeApp(firebaseConfig);
        this.auth = getAuth(this.app);
        this.db = getFirestore(this.app);
    }

    // --- Authentication ---

    async setAuthPersistence(remember: boolean) {
        try {
            const mode = remember ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(this.auth, mode);
            console.log(`Auth Persistence set to: ${remember ? 'LOCAL' : 'SESSION'}`);
        } catch (e) {
            console.error("Error setting persistence", e);
        }
    }

    setupRecaptcha(elementId: string) {
        if ((window as any).recaptchaVerifier) {
            (window as any).recaptchaVerifier.clear();
            (window as any).recaptchaVerifier = null;
        }

        try {
            (window as any).recaptchaVerifier = new RecaptchaVerifier(this.auth, elementId, {
                'size': 'invisible',
                'callback': () => {
                    console.log("Recaptcha verified");
                },
                'expired-callback': () => {
                    console.warn("Recaptcha expired");
                    this.clearRecaptcha();
                }
            });
        } catch (e) {
            console.error("Recaptcha Setup Error:", e);
        }
    }

    clearRecaptcha() {
        if ((window as any).recaptchaVerifier) {
            try {
                (window as any).recaptchaVerifier.clear();
            } catch (e) { }
            (window as any).recaptchaVerifier = null;
        }
    }

    async loginWithPhone(phoneNumber: string) {
        try {
            if (!(window as any).recaptchaVerifier) {
                return { success: false, message: "Recaptcha not initialized. Reload page." };
            }
            const appVerifier = (window as any).recaptchaVerifier;
            this.confirmationResult = await signInWithPhoneNumber(this.auth, phoneNumber, appVerifier);
            return { success: true, startOtp: true };
        } catch (error: any) {
            console.error("Phone Login Error", error);
            // Translate common firebase errors
            let msg = error.message;
            if (error.code === 'auth/invalid-phone-number') msg = "Invalid phone number format.";
            if (error.code === 'auth/too-many-requests') msg = "Too many attempts. Try again later.";
            return { success: false, message: msg };
        }
    }

    async verifyPhoneOtp(otp: string, overrides?: { name?: string, role?: string }) {
        if (!this.confirmationResult) throw new Error("No OTP requested");
        try {
            const result = await this.confirmationResult.confirm(otp);
            const user = result.user;
            await this.syncUserToDB(user, overrides);
            return { success: true, user };
        } catch (error: any) {
            return { success: false, message: "Invalid OTP" };
        }
    }

    async logout() {
        await signOut(this.auth);
    }

    getCurrentUser() {
        return this.auth.currentUser;
    }

    subscribeToAuthChanges(callback: (user: FirebaseUser | null) => void) {
        return onAuthStateChanged(this.auth, (user) => {
            callback(user);
        });
    }

    // --- Database Sync (User Profile) ---

    async syncLocalUserToCloud(mobile: string, name: string, role: string) {
        try {
            // Create a deterministic ID for demo users (e.g., mobile number)
            const uid = `demo_${mobile}`;
            const userRef = doc(this.db, "users", uid);
            const docSnap = await getDoc(userRef);

            if (!docSnap.exists()) {
                await setDoc(userRef, {
                    uid: uid,
                    mobile: mobile,
                    email: "",
                    name: name || "Demo Farmer",
                    avatar: `https://i.pravatar.cc/150?u=${uid}`,
                    role: role || 'USER',
                    plan: 'Free',
                    lastLogin: Date.now(),
                    isDemo: true
                });
            } else {
                await updateDoc(userRef, {
                    lastLogin: Date.now(),
                    // Update name/role if changed? Optional, usually keep existing profile
                    // name: name || docSnap.data().name 
                });
            }
            console.log("Demo user synced to Cloud:", uid, role);
            return { uid, name, mobile, role };
        } catch (e: any) {
            console.error("Demo Sync Failed:", e);
            // Don't alert here to avoid spamming validity checks, but log it
        }
    }

    async syncUserToDB(firebaseUser: FirebaseUser, overrides?: { name?: string, role?: string }) {
        try {
            console.log("Syncing user to Firestore:", firebaseUser.uid);
            const userRef = doc(this.db, "users", firebaseUser.uid);

            // Check if user exists to avoid overwriting name with default "Farmer"
            const docSnap = await getDoc(userRef);
            let finalUser: any = {};

            if (docSnap.exists()) {
                // User exists, just update lastLogin AND return the real data
                await updateDoc(userRef, { lastLogin: Date.now() });
                finalUser = docSnap.data();
                console.log("User sync (update) successful", finalUser);
            } else {
                // New user, create with defaults OR overrides
                finalUser = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    mobile: firebaseUser.phoneNumber,
                    name: overrides?.name || firebaseUser.displayName || "Farmer",
                    avatar: firebaseUser.photoURL || `https://i.pravatar.cc/150?u=${firebaseUser.uid}`,
                    role: overrides?.role || 'USER', // Default or Override
                    plan: 'Free',
                    lastLogin: Date.now()
                };
                await setDoc(userRef, finalUser);
                console.log("User sync (create) successful");
            }
            return finalUser;

        } catch (e: any) {
            console.error("FATAL: User sync failed:", e);
            // alert("Database Sync Failed: " + e.message); // Visible feedback to user
            return null;
        }
    }

    // Helper to get raw profile
    async getUserProfile(uid: string) {
        try {
            const docSnap = await getDoc(doc(this.db, "users", uid));
            return docSnap.exists() ? docSnap.data() : null;
        } catch (e) {
            console.error("Error fetching profile:", e);
            return null;
        }
    }

    // Real-time User Listener
    subscribeToUsers(callback: (users: any[]) => void) {
        const q = query(collection(this.db, "users"));
        return onSnapshot(q, (snapshot) => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
            callback(users);
        });
    }

    // Real-time Single User Profile Listener
    subscribeToUserProfile(uid: string, callback: (user: any) => void) {
        const userRef = doc(this.db, "users", uid);
        return onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                callback(doc.data());
            } else {
                callback(null);
            }
        });
    }

    async getUsers(lastDoc?: QueryDocumentSnapshot, limitCount: number = 20) {
        try {
            let q;
            if (lastDoc) {
                q = query(collection(this.db, "users"), orderBy("lastLogin", "desc"), startAfter(lastDoc), limit(limitCount));
            } else {
                q = query(collection(this.db, "users"), orderBy("lastLogin", "desc"), limit(limitCount));
            }

            const snapshot = await getDocs(q);
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
            const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;
            return { users, lastDoc: lastVisible };
        } catch (e) {
            console.error("Error fetching users:", e);
            return { users: [], lastDoc: null };
        }
    }

    async searchUsers(term: string) {
        // Basic prefix search on 'name' - robust search requires Typesense/Algolia
        try {
            const usersRef = collection(this.db, "users");
            // Firestore doesn't support OR queries across different fields efficiently without composite indexes
            // We'll try name prefix
            const q = query(usersRef,
                where('name', '>=', term),
                where('name', '<=', term + '\uf8ff'),
                limit(10)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        } catch (e) {
            console.error("Search failed, trying mobile fallback", e);
            // Fallback to mobile check if name fails (e.g., term is number)
            try {
                const q = query(collection(this.db, "users"), where('mobile', '==', term));
                const snap = await getDocs(q);
                return snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
            } catch (e2) {
                return [];
            }
        }
    }

    async updateUser(uid: string, data: any) {
        try {
            await updateDoc(doc(this.db, "users", uid), data);
            return true;
        } catch (e) {
            console.error("Error updating user:", e);
            return false;
        }
    }

    async deleteUser(uid: string) {
        try {
            await deleteDoc(doc(this.db, "users", uid));
            // Note: This won't delete Auth account, only Firestore doc. Admin SDK needed for full delete.
            return true;
        } catch (e) {
            console.error("Error deleting user:", e);
            return false;
        }
    }

    async incrementUserScanCount(uid: string) {
        try {
            const userRef = doc(this.db, "users", uid);
            // Create a dedicated 'usage' field or subcollection?
            // Let's keep it simple on the user doc for now to save reads
            await updateDoc(userRef, {
                scansCount: increment(1),
                lastScanDate: Date.now()
            });
            return true;
        } catch (e) {
            console.error("Error incrementing scan count:", e);
            return false;
        }
    }

    async incrementUserChatCount(uid: string) {
        try {
            const userRef = doc(this.db, "users", uid);
            await updateDoc(userRef, {
                chatCount: increment(1),
                lastChatDate: Date.now()
            });
            return true;
        } catch (e) {
            console.error("Error incrementing chat count:", e);
            return false;
        }
    }

    async upgradeUserPlan(uid: string, plan: string) {
        try {
            const userRef = doc(this.db, "users", uid);
            const updates: any = { plan };

            // Set expiry if Pro
            if (plan === 'Pro Farmer' || plan === 'PREMIUM') {
                updates.planExpiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
            } else if (plan === 'Enterprise') {
                updates.planExpiry = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
            }

            // Reset limits on upgrade so they can immediately use features if they were blocked
            updates.scansCount = 0;
            updates.chatCount = 0;
            updates.lastPlanUpdate = Date.now();

            await updateDoc(userRef, updates);
            return true;
        } catch (e) {
            console.error("Error upgrading user plan:", e);
            return false;
        }
    }

    // --- Community Posts ---

    async addPost(content: string, authorName: string, authorAvatar: string, image: string | null = null) {
        try {
            const docRef = await addDoc(collection(this.db, "posts"), {
                content,
                author: authorName,
                avatar: authorAvatar,
                image: image,
                timestamp: Date.now(),
                likes: 0,
                comments: 0
            });
            console.log("Document written with ID: ", docRef.id);
            return true;
        } catch (e) {
            console.error("Error adding document: ", e);
            return false;
        }
    }

    async getPosts(lastDoc?: QueryDocumentSnapshot, limitCount: number = 10): Promise<{ posts: Post[], lastDoc: QueryDocumentSnapshot | null }> {
        let q = query(collection(this.db, "posts"), orderBy("timestamp", "desc"), limit(limitCount));

        if (lastDoc) {
            q = query(collection(this.db, "posts"), orderBy("timestamp", "desc"), startAfter(lastDoc), limit(limitCount));
        }

        const querySnapshot = await getDocs(q);
        const posts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;

        return { posts, lastDoc: lastVisible };
    }

    async deletePost(id: string) {
        try {
            await deleteDoc(doc(this.db, "posts", id));
            return true;
        } catch (e) {
            console.error("Error deleting post:", e);
            return false;
        }
    }

    async toggleLikePost(postId: string, userId: string): Promise<boolean> {
        if (!userId) return false;
        const postRef = doc(this.db, "posts", postId);
        try {
            const postSnap = await getDoc(postRef);
            if (!postSnap.exists()) return false;

            const postData = postSnap.data() as Post;
            const likedBy = postData.likedBy || [];
            const isLiked = likedBy.includes(userId);

            if (isLiked) {
                await updateDoc(postRef, {
                    likes: increment(-1),
                    likedBy: arrayRemove(userId)
                });
            } else {
                await updateDoc(postRef, {
                    likes: increment(1),
                    likedBy: arrayUnion(userId)
                });
            }
            return !isLiked; // Return new state (true=liked, false=unliked)
        } catch (e) {
            console.error("Error toggling like:", e);
            return false;
        }
    }

    async addCommentToPost(postId: string, comment: { text: string, authorName: string, authorAvatar: string, userId: string }) {
        try {
            // Add to subcollection
            await addDoc(collection(this.db, "posts", postId, "comments"), {
                ...comment,
                timestamp: Date.now()
            });

            // Increment count on parent
            await updateDoc(doc(this.db, "posts", postId), {
                comments: increment(1)
            });
            return true;
        } catch (e) {
            console.error("Error adding comment:", e);
            return false;
        }
    }

    async getCommentsForPost(postId: string) {
        try {
            const q = query(collection(this.db, "posts", postId, "comments"), orderBy("timestamp", "asc"));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error("Error fetching comments:", e);
            return [];
        }
    }

    async getCollectionCount(colName: string): Promise<number> {
        try {
            const snapshot = await getDocs(collection(this.db, colName));
            return snapshot.size;
        } catch (e) {
            console.error(`Error counting ${colName}:`, e);
            return 0;
        }
    }

    // --- Reports (Cloud Sync) ---

    async addReport(reportData: any) {
        try {
            const user = this.auth.currentUser;
            if (!user) throw new Error("User not logged in");

            const docRef = await addDoc(collection(this.db, "reports"), {
                ...reportData,
                userId: user.uid, // Link to Firebase UID
                timestamp: Date.now()
            });
            console.log("Report synced to Cloud:", docRef.id);
            return { success: true, id: docRef.id };
        } catch (e) {
            console.error("Error saving report to cloud:", e);
            return { success: false };
        }
    }

    async getUserReports(userId: string) { // Use string UID for Firebase
        try {
            const q = query(
                collection(this.db, "reports"),
                where("userId", "==", userId),
                orderBy("timestamp", "desc")
            );
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error("Error fetching cloud reports:", e);
            return [];
        }
    }

    // --- Notifications (Broadcast) ---

    async broadcastMessage(title: string, message: string, type: 'info' | 'alert' | 'warning') {
        try {
            await addDoc(collection(this.db, "notifications"), {
                title,
                message,
                type,
                timestamp: Date.now(),
                expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24h expiry logic for client filter
            });
            console.log("Broadcast sent!");
            return true;
        } catch (e) {
            console.error("Broadcast failed:", e);
            return false;
        }
    }

    async getActiveNotifications() {
        const q = query(collection(this.db, "notifications"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // --- Marketplace (Cloud) ---

    async addMarketItem(item: any) {
        try {
            const docRef = await addDoc(collection(this.db, "market_items"), {
                ...item,
                timestamp: Date.now(),
                status: 'pending' // Default status
            });
            return { success: true, id: docRef.id };
        } catch (e) {
            console.error("Error adding market item:", e);
            return { success: false };
        }
    }

    async getMarketItems(includeAll: boolean = false, lastDoc?: QueryDocumentSnapshot, limitCount: number = 10) {
        try {
            let q;
            const baseRef = collection(this.db, "market_items");

            if (includeAll) {
                if (lastDoc) {
                    q = query(baseRef, orderBy("timestamp", "desc"), startAfter(lastDoc), limit(limitCount));
                } else {
                    q = query(baseRef, orderBy("timestamp", "desc"), limit(limitCount));
                }
            } else {
                if (lastDoc) {
                    q = query(baseRef, where("status", "==", "approved"), orderBy("timestamp", "desc"), startAfter(lastDoc), limit(limitCount));
                } else {
                    q = query(baseRef, where("status", "==", "approved"), orderBy("timestamp", "desc"), limit(limitCount));
                }
            }

            const snapshot = await getDocs(q);
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
            const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

            return { items, lastDoc: lastVisible };
        } catch (e) {
            console.error("Error getting market items:", e);
            return { items: [], lastDoc: null };
        }
    }

    async deleteMarketItem(id: string) { // Firestore uses string IDs
        try {
            await deleteDoc(doc(this.db, "market_items", id));
            return true;
        } catch (e) {
            console.error("Error deleting market item:", e);
            return false;
        }
    }

    async updateMarketItemStatus(id: string, status: string) {
        try {
            await updateDoc(doc(this.db, "market_items", id), { status });
            return true;
        } catch (e) {
            console.error("Error updating item status:", e);
            return false;
        }
    }

    // --- Affiliate Market (Real Config) ---

    async getAffiliateProducts() {
        try {
            const snapshot = await getDocs(collection(this.db, "affiliate_products"));
            let products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (products.length === 0) {
                // Seed if empty (One time)
                const defaults = [
                    {
                        name: "Nano Urea (Liquid) - IFFCO",
                        category: "Fertilizer",
                        image: "https://m.media-amazon.com/images/I/61y+1k3+78L._AC_UF1000,1000_QL80_.jpg",
                        price: 240,
                        rating: 4.5,
                        affiliateLink: "https://www.iffco.in/en/nano-urea",
                        commission: 12,
                        timestamp: Date.now()
                    },
                    {
                        name: "Roundup Herbicide",
                        category: "Pesticide",
                        image: "https://m.media-amazon.com/images/I/51w+1k3+78L._AC_UF1000,1000_QL80_.jpg",
                        price: 450,
                        rating: 4.2,
                        affiliateLink: "#",
                        commission: 45,
                        timestamp: Date.now()
                    }
                ];
                for (const p of defaults) {
                    await addDoc(collection(this.db, "affiliate_products"), p);
                }
                products = defaults as any;
            }
            return products;
        } catch (e) {
            console.error("Affiliate fetch error:", e);
            return [];
        }
    }


    // --- Community Chat System ---

    // 1. Create or Get Conversation
    async startConversation(sellerId: string, sellerName: string, sellerAvatar: string, itemId: string, itemTitle: string, itemPrice: number) {
        if (!this.auth.currentUser) throw new Error("Must be logged in");
        const myId = this.auth.currentUser.uid;

        // Validate sellerId - must be a valid Firebase UID (string), not 0 or "admin"
        if (!sellerId || sellerId === '0' || sellerId === 'guest' || typeof sellerId === 'number') {
            console.warn("Invalid sellerId for chat:", sellerId, "Using placeholder admin");
            sellerId = 'admin'; // Fallback for testing/old listings
        }

        console.log("Starting conversation between:", myId, "and", sellerId);

        // Check if conversation exists (compound query might need index, keeping it simple for now)
        // For scalability, we often use a deterministic ID like min(uid1, uid2)_max(uid1, uid2)_itemId
        const participants = [myId, sellerId].sort();
        const chatId = `${participants.join('_')}_${itemId}`;
        const chatRef = doc(this.db, "conversations", chatId);

        // We use setDoc with merge to create if not exists, or update timestamp if it does
        await setDoc(chatRef, {
            participants: [myId, sellerId],
            [myId]: { name: this.auth.currentUser.displayName || 'User', avatar: this.auth.currentUser.photoURL || '' },
            [sellerId]: { name: sellerName, avatar: sellerAvatar },
            itemId,
            itemTitle,
            itemPrice,
            lastMessage: "",
            lastMessageTime: Date.now(),
            updatedAt: Date.now()
        }, { merge: true });

        console.log("Conversation created/updated:", chatId, "Participants:", [myId, sellerId]);
        return chatId;
    }

    // 2. Send Message
    async sendMessage(chatId: string, text: string, type: 'text' | 'image' = 'text') {
        if (!this.auth.currentUser) return;

        const msgRef = await addDoc(collection(this.db, "conversations", chatId, "messages"), {
            text,
            senderId: this.auth.currentUser.uid,
            timestamp: Date.now(),
            type,
            read: false
        });

        // Update parent conversation
        await updateDoc(doc(this.db, "conversations", chatId), {
            lastMessage: type === 'image' ? '📷 Image' : text,
            lastMessageTime: Date.now(),
            updatedAt: Date.now() // Trigger sort
        });

        return msgRef.id;
    }

    // 3. Listen to My Conversations
    subscribeToConversations(callback: (chats: any[]) => void) {
        if (!this.auth.currentUser) return () => { };

        // Simple query - orderBy removed to avoid composite index requirement
        // TODO: Add composite index in Firebase Console, then uncomment orderBy
        const q = query(
            collection(this.db, "conversations"),
            where("participants", "array-contains", this.auth.currentUser.uid)
            // orderBy("updatedAt", "desc") // Requires composite index
        );

        return onSnapshot(q, (snapshot) => {
            const chats = snapshot.docs.map(doc => {
                const data = doc.data();
                const otherId = data.participants.find((p: string) => p !== this.auth.currentUser?.uid);
                return {
                    id: doc.id,
                    ...data,
                    otherUser: data[otherId] // Helper to get other user's details easily
                } as any;
            });

            // Sort client-side by updatedAt
            chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

            callback(chats);
        });
    }

    // Delete Conversation
    async deleteConversation(chatId: string) {
        try {
            await deleteDoc(doc(this.db, "conversations", chatId));
            console.log("Conversation deleted:", chatId);
        } catch (e) {
            console.error("Error deleting conversation:", e);
            throw e;
        }
    }

    // 4. Listen to Messages in a Chat
    subscribeToMessages(chatId: string, callback: (msgs: any[]) => void) {
        const q = query(
            collection(this.db, "conversations", chatId, "messages"),
            orderBy("timestamp", "asc")
        );

        return onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(msgs);
        });
    }
    // --- Support Tickets (Cloud) ---

    async createTicket(userId: string | number, userName: string, title: string, description: string) {
        try {
            await addDoc(collection(this.db, "tickets"), {
                userId: userId.toString(),
                userName,
                title,
                description,
                status: 'Open',
                timestamp: Date.now()
            });
            return true;
        } catch (e) {
            console.error("Error creating ticket:", e);
            return false;
        }
    }

    async getTickets(includeResolved: boolean = false) {
        try {
            let q;
            if (includeResolved) {
                q = query(collection(this.db, "tickets"), orderBy("timestamp", "desc"));
            } else {
                q = query(collection(this.db, "tickets"), where("status", "==", "Open"), orderBy("timestamp", "desc"));
            }
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        } catch (e) {
            console.error("Error fetching tickets:", e);
            return [];
        }
    }

    async resolveTicket(id: string) {
        try {
            await updateDoc(doc(this.db, "tickets", id), { status: 'Resolved' });
            return true;
        } catch (e) {
            console.error("Error resolving ticket:", e);
            return false;
        }
    }
    // --- Admin Stats (Global) ---

    async getAdminStats() {
        try {
            // Parallel fetch for counts
            const [usersSnapshot, reportsSnapshot, notifsSnapshot] = await Promise.all([
                getDocs(collection(this.db, "users")),
                getDocs(collection(this.db, "reports")),
                getDocs(query(collection(this.db, "notifications"), orderBy("timestamp", "desc"), limit(5)))
            ]);

            const totalUsers = usersSnapshot.size;
            const totalScans = reportsSnapshot.size;

            // Generate Recent Activity Feed (Mixed)
            const recentActivity: any[] = [];

            // 1. Recent Scans (Top 5)
            const reports = reportsSnapshot.docs
                .map(d => ({ id: d.id, ...d.data() as any, type: 'scan' }))
                .sort((a: any, b: any) => b.timestamp - a.timestamp)
                .slice(0, 5);
            recentActivity.push(...reports);

            // 2. Recent Users (Top 5 - purely by array order if no timestamp, but we added timestamp)
            const users = usersSnapshot.docs
                .map(d => ({ id: d.id, ...d.data() as any, type: 'user', title: 'New User Joined', message: `User ${(d.data() as any).name || 'Unknown'} joined` }))
                // We didn't explicitly index 'joinedDate' in Firestore users sync yet, but let's assume valid or fallback
                .sort((a: any, b: any) => (b.joinedDate || 0) - (a.joinedDate || 0))
                .slice(0, 5);
            recentActivity.push(...users);

            // 3. Notifications
            const notifs = notifsSnapshot.docs.map(d => ({ id: d.id, ...d.data() as any, type: 'notification' }));
            recentActivity.push(...notifs);

            // Sort mixed feed
            recentActivity.sort((a, b) => (b.timestamp || b.joinedDate || 0) - (a.timestamp || a.joinedDate || 0));

            // Generate Trend (Last 7 Days) - Simplified Logic
            // We loop through all reports/users (expensive for large DB, ok for MVP)
            const activityTrend = [];
            const now = new Date();
            for (let i = 6; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                date.setHours(0, 0, 0, 0);
                const nextDate = new Date(date);
                nextDate.setDate(date.getDate() + 1);

                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

                // Helper to count items in range
                const countInRange = (docs: any[], timeKey: string = 'timestamp') =>
                    docs.filter(d => {
                        const t = d.data()[timeKey] || 0;
                        return t >= date.getTime() && t < nextDate.getTime();
                    }).length;

                activityTrend.push({
                    name: dayName,
                    users: countInRange(usersSnapshot.docs, 'joinedDate'), // 'joinedDate' might be missing on some legacy users
                    scans: countInRange(reportsSnapshot.docs, 'timestamp')
                });
            }

            return {
                totalUsers,
                totalScans,
                recentActivity: recentActivity.slice(0, 10),
                activityTrend
            };

        } catch (e) {
            console.error("Error fetching admin stats:", e);
            throw e; // Let UI handle error or show fallback
        }
    }
    // --- AI Chat Logic ---

    async createAiConversation(userId: string) {
        try {
            const docRef = await addDoc(collection(this.db, "users", userId, "ai_conversations"), {
                timestamp: Date.now(),
                title: "New Chat",
                lastMessage: "",
            });
            return docRef.id;
        } catch (e) {
            console.error("Error creating AI conversation:", e);
            throw e;
        }
    }

    async updateAiConversationTitle(userId: string, conversationId: string, title: string) {
        try {
            await updateDoc(doc(this.db, "users", userId, "ai_conversations", conversationId), { title });
        } catch (e) {
            console.error("Error updating title:", e);
        }
    }

    async saveAiMessage(userId: string, conversationId: string, message: { role: string, content: string }) {
        if (!conversationId) return;
        try {
            await addDoc(collection(this.db, "users", userId, "ai_conversations", conversationId, "messages"), {
                ...message,
                timestamp: Date.now()
            });

            // Update parent preview
            await updateDoc(doc(this.db, "users", userId, "ai_conversations", conversationId), {
                lastMessage: message.content.substring(0, 50) + (message.content.length > 50 ? "..." : ""),
                timestamp: Date.now()
            });

            // Auto-title if it's the first user message and title is "New Chat"
            if (message.role === 'user') {
                const convoRef = doc(this.db, "users", userId, "ai_conversations", conversationId);
                const snap = await getDoc(convoRef);
                if (snap.exists() && snap.data().title === "New Chat") {
                    // Simple heuristic: use first 4-5 words
                    const newTitle = message.content.split(' ').slice(0, 5).join(' ');
                    await updateDoc(convoRef, { title: newTitle });
                }
            }

        } catch (e) {
            console.error("Error saving AI message:", e);
        }
    }

    async getAiConversations(userId: string) {
        try {
            const q = query(
                collection(this.db, "users", userId, "ai_conversations"),
                orderBy("timestamp", "desc")
            );
            const snap = await getDocs(q);
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error("Error fetching AI conversations:", e);
            return [];
        }
    }

    async getAiMessages(userId: string, conversationId: string) {
        try {
            const q = query(
                collection(this.db, "users", userId, "ai_conversations", conversationId, "messages"),
                orderBy("timestamp", "asc")
            );
            const snap = await getDocs(q);
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (e) {
            console.error("Error fetching AI messages:", e);
            return [];
        }
    }

    async deleteAiConversation(userId: string, conversationId: string) {
        try {
            await deleteDoc(doc(this.db, "users", userId, "ai_conversations", conversationId));
            return true;
        } catch (e) {
            return false;
        }
    }
}

export const firebaseService = new FirebaseService();
