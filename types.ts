export type NavItem = 'home' | 'login' | 'dashboard' | 'scan' | 'history' | 'market' | 'knowledge' | 'community' | 'settings' | 'chatbot' | 'upgrade' | 'org_dashboard' | 'admin_db' | 'admin_users' | 'admin_market' | 'admin_prices' | 'admin_support' | 'broadcast' | 'diagnosis_result' | 'jhum' | 'asha';

export type UserRole = 'USER' | 'ADMIN' | 'ORGANIZATION' | 'ASHA';

export type SubscriptionTier = 'FREE' | 'PREMIUM' | 'ENTERPRISE';

export interface UserProfile {
  id?: number | string;
  uid?: string; // Firebase UID
  name: string;
  plan: SubscriptionTier | string; // Allow string for backward compatibility/legacy plans
  avatar: string;
  role: UserRole;
  subscriptionExpiry?: number;
  scansCount?: number; // Usage tracking
  lastScanDate?: number;
  joinedDate?: number;
  chatCount?: number;
  lastChatDate?: number;
  mobile?: string;
  email?: string;
  status?: string;
  severity?: number;
}

export interface Disease {
  name: string;
  scientificName: string;
  crop: string;
  symptoms: string[];
  cure: string[];
  prevention: string[];
  cost_per_acre_inr: number;
  type?: string;
  image: string;
  treatment: {
    chemical: string[];
    organic: string[];
  };
}

export interface PredictionResult {
  disease: Disease;
  confidence: number;
}

export interface CropScan {
  id: string;
  cropName: string;
  location: string;
  date: string;
  status: 'Healthy' | 'Critical' | 'Moderate' | 'Low Risk';
  diagnosis?: string;
  confidence?: number;
  imageUrl: string;
  severity: number; // 0-100
  cost?: number;
}

export interface MarketPrice {
  crop: string;
  variety: string;
  mandi: string;
  price: number;
  trend: number;
  status: 'Active' | 'Closing' | 'Closed';
}