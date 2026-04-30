import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { UserProfile } from '../types';
import { dbService } from '../services/DatabaseService';
import { getTranslation } from '../utils/translations';

interface LearningCenterProps {
    user?: UserProfile | null;
    language?: string;
}

const LearningCenter: React.FC<LearningCenterProps> = ({ user, language = 'English' }) => {
  const t = (key: string) => getTranslation(language, key);
  const categories = ['All', 'Pest Control', 'Soil Health', 'Irrigation', 'Organic Farming', 'Machinery'];
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [articles, setArticles] = useState<any[]>([]);
  
  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Pest Control');
  const [newContent, setNewContent] = useState('');
  const [newImage, setNewImage] = useState('https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=400');
  const [newReadTime, setNewReadTime] = useState('5 min read');

  useEffect(() => {
      loadArticles();
  }, []);

  // Lock body scroll when article modal is open
  useEffect(() => {
      if (selectedArticle) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = '';
      }
      return () => { document.body.style.overflow = ''; };
  }, [selectedArticle]);

  const loadArticles = async () => {
      const dbArticles = await dbService.getArticles();
      const defaultArticles = [
        // === FEATURED / POPULAR ===
        { id: 1, title: 'Wheat Rust: Complete Identification & Treatment Guide', category: 'Pest Control', readTime: '7 min read', type: 'Article', featured: true,
          image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?q=80&w=400',
          content: '**Wheat rust** is the most devastating fungal disease affecting Indian wheat crops, causing up to 40% yield loss.\n\n## Types of Wheat Rust\n\n**1. Brown Rust (Leaf Rust)** — Most common. Orange-brown pustules on leaf surface. Peak: Feb-March.\n**2. Yellow Rust (Stripe Rust)** — Yellow stripes along leaf veins. Favored by cool, moist weather (15-20°C).\n**3. Black Rust (Stem Rust)** — Dark pustules on stems. Most destructive but less common in India.\n\n## Early Detection\n- Scout fields weekly from January to March\n- Check lower leaves first — rust starts there\n- Use KropScan: photograph suspect leaves for instant AI diagnosis\n\n## Treatment Protocol\n**Chemical (emergency):**\n- Propiconazole 25% EC @ 0.1% (500ml/ha) — spray at first sign\n- Tebuconazole 250 EC @ 0.1% — effective against all three rusts\n- Mancozeb 75% WP @ 2.5g/L — preventive spray\n\n**Organic alternatives:**\n- Neem oil 2ml/L — weekly preventive spray\n- Trichoderma viride seed treatment (4g/kg seed)\n- Bordeaux mixture 1% — copper-based fungicide\n\n## Prevention\n- Plant rust-resistant varieties (HD 3086, DBW 187)\n- Avoid late sowing (after Nov 25 in North India)\n- Balanced fertilization — excess nitrogen increases susceptibility\n\n**Cost estimate:** ₹800-1200/acre for chemical treatment.' },

        { id: 2, title: 'Rice Blast: India\'s #1 Rice Disease', category: 'Pest Control', readTime: '6 min read', type: 'Article',
          image: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=400',
          content: '**Rice blast** (caused by *Magnaporthe oryzae*) is the most destructive rice disease worldwide, responsible for 10-30% yield loss annually in India.\n\n## Symptoms\n- **Leaf blast:** Diamond-shaped lesions with gray center and brown border\n- **Neck blast:** Neck of panicle turns brown-black, panicle breaks and hangs\n- **Node blast:** Blackening at nodes, stem breakage\n\n## When It Strikes\n- Kharif season (July-October) during humid weather\n- Temperatures 25-28°C with >90% humidity\n- Continuous cloud cover for 5+ days\n\n## Treatment\n**Chemical:**\n- Tricyclazole 75% WP @ 0.6g/L — most effective, spray at booting stage\n- Isoprothiolane 40% EC @ 1.5ml/L — systemic action\n- Carbendazim 50% WP @ 1g/L — broad spectrum\n\n**Organic:**\n- Pseudomonas fluorescens @ 10g/L — bio-fungicide\n- Silicon foliar spray — strengthens cell walls\n- Trichoderma harzianum soil application\n\n## Prevention\n- Use blast-resistant varieties (Pusa Basmati 1509, Samba Mahsuri)\n- Avoid excess nitrogen fertilization\n- Maintain proper water management — alternate wetting and drying\n- Seed treatment with Tricyclazole before nursery\n\n**Cost:** ₹1000-1500/acre' },

        { id: 3, title: 'Drip Irrigation: Save 50% Water, Double Yield', category: 'Irrigation', readTime: '10 min read', type: 'Article',
          image: 'https://images.unsplash.com/photo-1560493676-04071c5f467b?q=80&w=400',
          content: '**Drip irrigation** delivers water directly to plant roots through a network of pipes and emitters, saving 30-50% water compared to flood irrigation.\n\n## Why Switch to Drip?\n- **50% water savings** — critical in water-scarce regions\n- **25-40% higher yield** — consistent moisture = better growth\n- **Lower labor costs** — automated, no field flooding\n- **Government subsidy** — PMKSY covers 55-90% cost for small farmers\n\n## Setup Components\n1. **Water source** — bore well, canal, or tank (minimum 1 HP pump)\n2. **Filter unit** — screen filter + sand filter (₹3,000-8,000)\n3. **Main line** — PVC pipe from source to field (63mm)\n4. **Sub-main** — PVC lateral lines (40mm)\n5. **Drip laterals** — 16mm LLDPE tubes with inline emitters\n6. **Emitters** — 2-4 L/hr flow rate (spacing depends on crop)\n\n## Cost Breakdown (per acre)\n- Basic system: ₹25,000-35,000\n- After PMKSY subsidy: ₹5,000-15,000\n- Annual maintenance: ₹2,000-3,000\n- **ROI: 6-12 months** through water and yield gains\n\n## Crop-Specific Spacing\n| Crop | Lateral Spacing | Emitter Spacing |\n|------|----------------|------------------|\n| Tomato | 1.5m | 0.5m |\n| Cotton | 1.5m | 0.6m |\n| Sugarcane | 1.5m | 0.5m |\n| Mango | 6m | 1m (4 emitters/tree) |\n\n## Maintenance Tips\n- Flush laterals monthly\n- Clean filters weekly during peak season\n- Check for clogged emitters — use acid treatment if needed\n- Winterize system if not in use' },

        { id: 4, title: 'Understanding Soil pH: The Foundation of Healthy Crops', category: 'Soil Health', readTime: '5 min read', type: 'Article',
          image: 'https://images.unsplash.com/photo-1592841200221-a6898f307baa?q=80&w=400',
          content: '**Soil pH** determines which nutrients are available to your crops. Getting it wrong means fertilizers go to waste.\n\n## The pH Scale for Farmers\n- **Below 5.5** — Too acidic. Iron/aluminum toxicity. Common in Northeast India, Western Ghats.\n- **5.5-6.5** — Slightly acidic. Ideal for rice, tea, potato.\n- **6.5-7.5** — Neutral. Ideal for most crops (wheat, maize, vegetables).\n- **Above 7.5** — Alkaline. Iron/zinc deficiency. Common in Punjab, Haryana, Rajasthan.\n\n## How to Test\n1. **Soil testing lab** — ₹30-100 per sample at Krishi Vigyan Kendra\n2. **pH meter** — ₹500-2000 (reusable, instant results)\n3. **pH strips** — ₹100 for 100 strips (less accurate)\n\n## Correcting pH\n**Too acidic (below 6.0):**\n- Apply agricultural lime (CaCO₃) — 2-4 quintals/acre\n- Dolomite — adds both calcium and magnesium\n- Wood ash — mild correction + potassium\n\n**Too alkaline (above 7.5):**\n- Gypsum (CaSO₄) — 2-4 quintals/acre for sodic soils\n- Sulfur powder — 10-15 kg/acre\n- Organic matter (compost, FYM) — improves buffering\n\n## State-wise pH Trends\n| Region | Typical pH | Common Issue |\n|--------|-----------|-------------|\n| Punjab, Haryana | 7.5-8.5 | Alkaline, zinc deficiency |\n| UP, Bihar | 7.0-8.0 | Slightly alkaline |\n| Northeast India | 4.5-5.5 | Highly acidic |\n| Kerala, Karnataka | 5.0-6.5 | Acidic |\n| Maharashtra | 7.0-8.0 | Neutral to alkaline |' },

        { id: 5, title: 'Mango Anthracnose: Protect Your Orchard', category: 'Pest Control', readTime: '5 min read', type: 'Article',
          image: 'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?q=80&w=400',
          content: '**Anthracnose** is the most serious disease of mango in India, affecting flowers, fruits, and leaves. It can cause 30-50% crop loss in severe cases.\n\n## Symptoms\n- **On leaves:** Small black spots that enlarge and merge\n- **On flowers:** Blossom blight — flowers turn black and drop\n- **On fruits:** Dark sunken spots, fruit rot during storage\n\n## When It Strikes\n- Peak: February-April (flowering to fruiting)\n- Favored by: rain during flowering, humidity >80%, temperature 25-30°C\n\n## Treatment\n**Chemical (spray schedule):**\n1. Before flowering: Carbendazim 1g/L\n2. At 50% flowering: Copper oxychloride 3g/L\n3. At fruit set: Mancozeb 2.5g/L\n4. Pre-harvest: Carbendazim 1g/L (14-day gap)\n\n**Organic:**\n- Bordeaux mixture 1% — copper-based, effective preventive\n- Neem oil 5ml/L — spray at flower bud stage\n- Bio-agent: Trichoderma viride (5g/L soil drench)\n\n## Post-Harvest\n- Hot water treatment: Dip fruits in 52°C water for 5 minutes\n- This kills surface spores and extends shelf life by 5-7 days\n\n**Cost:** ₹600-900/tree for season-long protection' },

        { id: 6, title: 'Organic Farming: Getting PM-PGS Certified', category: 'Organic Farming', readTime: '8 min read', type: 'Article',
          image: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=400',
          content: '**Participatory Guarantee System (PGS)** is India\'s own organic certification — free, farmer-friendly, and government-recognized.\n\n## Why Get Certified?\n- **30-50% premium** on organic produce\n- **Government support** — subsidies under Paramparagat Krishi Vikas Yojana (PKVY)\n- **Market access** — sell on organic marketplaces, export eligibility\n- **Soil health** — long-term improvement in soil biology\n\n## PGS-India Process\n1. **Form a group** — minimum 5 farmers, maximum 50\n2. **Register** — at pgsindia-ncof.gov.in (free registration)\n3. **Conversion period** — 2-3 years (crops can be sold as \"in conversion\")\n4. **Peer inspection** — group members inspect each other\'s farms\n5. **Certification** — Regional Council approves after inspection\n\n## Key Organic Inputs\n| Input | Purpose | Cost/acre |\n|-------|---------|----------|\n| Vermicompost | Soil nutrition | ₹2,000-3,000 |\n| Jeevamrut | Microbial boost | ₹200-300 |\n| Panchagavya | Growth promoter | ₹150-200 |\n| Neem cake | Pest control | ₹800-1,000 |\n| Trichoderma | Bio-fungicide | ₹300-400 |\n\n## Transition Tips\n- Start with one field, not entire farm\n- Build compost heap 6 months before conversion\n- Plant nitrogen-fixing cover crops (dhaincha, sunhemp)\n- Keep records — PGS requires documentation of all inputs' },

        { id: 7, title: 'Tomato Late Blight: Emergency Response Guide', category: 'Pest Control', readTime: '4 min read', type: 'Article',
          image: 'https://images.unsplash.com/photo-1471194402529-8e0f5a675de6?q=80&w=400',
          content: '**Late blight** can destroy a tomato crop in 7-10 days if untreated. This is an emergency guide.\n\n## Identify Fast\n- Water-soaked dark patches on leaves (start from edges)\n- White fuzzy growth on leaf underside (morning dew)\n- Brown lesions on stems\n- Firm brown spots on green fruits\n\n## Emergency Action (Day 1)\n1. **Remove** severely infected plants — burn, don\'t compost\n2. **Spray immediately:** Metalaxyl + Mancozeb (Ridomil Gold) @ 2.5g/L\n3. **Repeat** every 5 days for 3 applications\n\n## Prevention for Next Season\n- Resistant varieties: Arka Rakshak, Arka Samrat\n- Stake plants for air circulation\n- Avoid overhead irrigation — use drip\n- Mulch with black plastic — prevents soil splash\n- 3-year rotation — don\'t plant tomato/potato in same field\n\n**Cost:** ₹800-1200/acre per spray cycle' },

        { id: 8, title: 'Government Schemes Every Farmer Should Know (2026)', category: 'Soil Health', readTime: '6 min read', type: 'Article', featured: true,
          image: 'https://images.unsplash.com/photo-1589923188651-268a9765e432?q=80&w=400',
          content: '## Key Schemes for Indian Farmers in 2026\n\n**1. PM-KISAN** — ₹6,000/year direct transfer\n- Eligibility: All landholding farmers\n- Apply: pmkisan.gov.in\n\n**2. Pradhan Mantri Fasal Bima Yojana (PMFBY)**\n- Crop insurance at 1.5-5% premium (Kharif: 2%, Rabi: 1.5%)\n- Covers natural calamities, pests, diseases\n- Apply through bank or CSC center\n\n**3. Kisan Credit Card (KCC)**\n- Loan up to ₹3 lakh at 4% interest (with subsidy)\n- Covers crop production, maintenance, working capital\n- Apply at any bank branch\n\n**4. PM Kisan Samman Nidhi Drone Scheme**\n- Subsidy for drone-based crop spraying\n- Up to 50% subsidy for SC/ST farmers\n\n**5. Soil Health Card Scheme**\n- Free soil testing every 2 years\n- Customized fertilizer recommendations\n- Apply at nearest Krishi Vigyan Kendra\n\n**6. eNAM (National Agriculture Market)**\n- Sell produce online to any mandi in India\n- Transparent pricing, reduced middlemen\n- Register at enam.gov.in\n\n**7. PMKSY (Micro Irrigation)**\n- 55% subsidy for small farmers on drip/sprinkler\n- Up to 90% for SC/ST categories\n\n## How to Apply\n- Visit nearest **CSC (Common Service Center)**\n- Carry: Aadhaar, land records, bank passbook\n- Or call **Kisan Call Center: 1800-180-1551** (toll-free)' },

        { id: 9, title: 'Potato Crop Calendar: Month-by-Month Guide', category: 'Soil Health', readTime: '5 min read', type: 'Article',
          image: 'https://images.unsplash.com/photo-1590165482129-1b8b27698780?q=80&w=400',
          content: '## Complete Potato Growing Calendar (North India)\n\n**October — Land Preparation**\n- Deep plough 2-3 times\n- Apply FYM: 10-15 tonnes/acre\n- Ridge and furrow preparation\n\n**November — Planting**\n- Seed rate: 8-10 quintals/acre\n- Spacing: 60cm x 20cm\n- Seed treatment: Mancozeb 3g/kg\n- Basal dose: DAP 2 bags + MOP 1 bag/acre\n\n**December — Growth Stage**\n- First earthing up at 25-30 days\n- First irrigation at 7-10 days after planting\n- Watch for: Aphids (spray Imidacloprid if seen)\n\n**January — Tuber Formation**\n- Second earthing up\n- Top dress: Urea 1 bag/acre\n- Monitor late blight — spray Mancozeb preventively\n- Irrigation every 10-12 days\n\n**February — Maturity**\n- Stop irrigation 10 days before harvest\n- Cut haulms (top growth) when 75% foliage turns yellow\n- Wait 10-15 days for skin hardening\n\n**March — Harvest**\n- Harvest when soil is dry\n- Avoid cutting tubers — use careful digging\n- Grade by size, store in cold storage (2-4°C)\n\n**Expected Yield:** 80-120 quintals/acre\n**Cost of Production:** ₹35,000-45,000/acre\n**Expected Revenue:** ₹60,000-1,20,000/acre' },

        { id: 10, title: 'How to Use KropScan: Complete Guide', category: 'Machinery', readTime: '3 min read', type: 'Article', featured: true,
          image: 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?q=80&w=400',
          content: '## Getting Started with KropScan\n\n**Step 1: Scan Your Crop**\n- Open KropScan → New Scan\n- Take a clear photo of the affected leaf (good lighting, close-up)\n- Our AI identifies the disease in 2-3 seconds — even offline!\n\n**Step 2: Read the Diagnosis**\n- Disease name, severity, and confidence score\n- Affected area estimation and spread risk\n- Chemical and organic treatment options with dosage\n\n**Step 3: Buy Treatment**\n- Tap \"Buy Kit\" for 1-click treatment purchase on Amazon India\n- Delivered to your doorstep in 24-48 hours\n\n**Step 4: Ask KropBot**\n- Tap \"Chat Now\" for follow-up questions\n- \"Is this safe for my soil?\" \"What about my other crops?\"\n- Supports voice input in 11 Indian languages\n\n**Step 5: Track Progress**\n- My Reports shows all your scan history\n- Crop Health Timeline tracks improvement over time\n- Smart Crop Planner reminds you of next steps\n\n## Tips for Best Results\n- Photograph the most affected leaf, not the whole plant\n- Use natural daylight, avoid flash\n- Include both sides of the leaf if possible\n- Scan early — catching disease at 10% is better than 50%\n\n## Offline Mode\nKropScan works completely offline! The AI model runs on your phone. No internet = no problem. When you reconnect, reports sync automatically to the cloud.' },
      ];
      
      // Featured articles first, then by ID order, then user-submitted
      const featured = defaultArticles.filter(a => a.featured);
      const rest = defaultArticles.filter(a => !a.featured);
      setArticles([...featured, ...rest, ...dbArticles]);
  };

  const handleAddArticle = async () => {
      if (!newTitle || !newContent) return;
      
      await dbService.addArticle({
          title: newTitle,
          category: newCategory,
          content: newContent,
          image: newImage,
          readTime: newReadTime,
          type: 'Article'
      });
      
      setIsAddModalOpen(false);
      // Reset form
      setNewTitle('');
      setNewContent('');
      loadArticles();
  };

  return (
    <div className="p-3 md:p-6 lg:p-10 max-w-7xl mx-auto space-y-4 md:space-y-8 animate-fade-in relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 md:gap-6">
            <div>
            <h1 className="text-xl md:text-3xl font-black text-gray-900 dark:text-white mb-1 md:mb-2">{t('Agricultural Knowledge Hub')}</h1>
            <p className="text-xs md:text-base text-gray-500 dark:text-gray-400">{t('Expert guides desc')}</p>
            </div>
            <div className="flex gap-2 md:gap-3 w-full md:w-auto">
                {user?.role === 'ADMIN' && (
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-primary text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-[#345f30] transition-colors flex items-center gap-1.5 md:gap-2 text-sm md:text-base"
                    >
                        <span className="material-icons-round text-lg md:text-2xl">add</span> {t('Add Article')}
                    </button>
                )}
                <div className="relative flex-1 md:flex-none md:w-auto">
                    <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                        <span className="material-icons-round text-lg md:text-2xl">search</span>
                    </span>
                    <input
                        type="text"
                        placeholder={t('Search articles')}
                        className="w-full md:w-64 pl-9 md:pl-10 pr-3 md:pr-4 py-2.5 md:py-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-surface-dark focus:ring-2 focus:ring-primary/50 outline-none text-sm md:text-base"
                    />
                </div>
            </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 md:gap-3 overflow-x-auto pb-2 no-scrollbar -mx-3 px-3 md:mx-0 md:px-0">
            {categories.map((cat, i) => (
                <button
                    key={i}
                    className={`px-3.5 md:px-5 py-2 md:py-2.5 rounded-full text-xs md:text-sm font-bold whitespace-nowrap transition-colors ${
                        i === 0
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-white dark:bg-surface-dark text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-50'
                    }`}
                >
                    {cat}
                </button>
            ))}
        </div>

        {/* Featured Card */}
        <div className="bg-primary rounded-2xl md:rounded-[2.5rem] p-5 md:p-8 lg:p-12 text-white relative overflow-hidden shadow-xl">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1500937386664-56d1dfef3854?q=80&w=1200')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/80 to-transparent"></div>
            <div className="relative z-10 max-w-xl space-y-2.5 md:space-y-4">
                <span className="bg-white/20 backdrop-blur-md px-2.5 md:px-3 py-1 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest">{t('Featured Course')}</span>
                <h2 className="text-xl md:text-3xl lg:text-5xl font-black leading-tight">{t('Sustainable Farming 101')}</h2>
                <p className="text-green-50 text-sm md:text-lg opacity-90">{t('Sustainable Farming Desc')}</p>
                <div className="pt-2 md:pt-4">
                    <button className="bg-white text-primary px-5 md:px-8 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl font-bold hover:bg-green-50 transition-colors shadow-lg text-sm md:text-base"
                        onClick={() => document.getElementById('articles-section')?.scrollIntoView({ behavior: 'smooth' })}>{t('Start Learning')}</button>
                </div>
            </div>
        </div>

        {/* Grid */}
        <div id="articles-section" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
            {articles.map((article) => (
                <div
                    key={article.id || article.timestamp} // Fallback key
                    onClick={() => setSelectedArticle(article)}
                    className="bg-white dark:bg-surface-dark rounded-2xl md:rounded-[2rem] overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all group cursor-pointer"
                >
                    <div className="h-36 md:h-48 relative overflow-hidden">
                        <img src={article.image} alt={article.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        <div className="absolute top-3 left-3 md:top-4 md:left-4 bg-white/90 dark:bg-black/80 backdrop-blur-sm px-2.5 md:px-3 py-0.5 md:py-1 rounded-lg text-[10px] md:text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                            {article.category}
                        </div>
                        {article.type === 'Video' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                                <span className="material-icons-round text-white text-4xl md:text-5xl drop-shadow-lg">play_circle</span>
                            </div>
                        )}
                    </div>
                    <div className="p-4 md:p-6">
                        <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs text-gray-400 font-bold uppercase tracking-wider mb-1.5 md:mb-2">
                             <span className="material-icons-round text-xs md:text-sm">{article.type === 'Video' ? 'videocam' : 'article'}</span>
                             {article.readTime}
                        </div>
                        <h3 className="text-base md:text-xl font-bold text-gray-900 dark:text-white mb-2 md:mb-3 group-hover:text-primary transition-colors leading-snug">{t(article.title)}</h3>
                        <div className="flex items-center justify-between mt-3 md:mt-4 pt-3 md:pt-4 border-t border-gray-100 dark:border-gray-800">
                             <div className="flex -space-x-2">
                                <img className="w-5 h-5 md:w-6 md:h-6 rounded-full border border-white" src="https://i.pravatar.cc/150?u=20" alt=""/>
                                <img className="w-5 h-5 md:w-6 md:h-6 rounded-full border border-white" src="https://i.pravatar.cc/150?u=21" alt=""/>
                             </div>
                             <span className="text-[10px] md:text-xs font-bold text-primary">{t('Read Now')}</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>

        {/* Article Popup Modal — portalled to document.body to cover sidebar */}
        {selectedArticle && ReactDOM.createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{margin: 0}}>
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedArticle(null)} />
                {/* Modal card */}
                <div className="relative bg-white dark:bg-gray-900 w-[96vw] md:w-[90vw] max-w-2xl max-h-[90vh] md:max-h-[80vh] rounded-2xl md:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    {/* Header with image */}
                    <div className="relative flex-shrink-0">
                        <img src={selectedArticle.image} alt={selectedArticle.title} className="w-full h-36 md:h-48 object-cover" onError={(e: React.SyntheticEvent<HTMLImageElement>) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=400'; }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                        <button onClick={() => setSelectedArticle(null)} className="absolute top-3 right-3 md:top-4 md:right-4 p-2 bg-white/90 dark:bg-black/70 rounded-full hover:bg-white transition-colors shadow-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
                            <span className="material-icons-round text-gray-800 dark:text-white text-xl">close</span>
                        </button>
                        <div className="absolute bottom-3 left-4 right-14 md:bottom-4 md:left-6 md:right-16">
                            <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                                <span className="px-2 md:px-2.5 py-0.5 md:py-1 bg-white/90 text-green-700 rounded-lg text-[10px] font-black uppercase tracking-wider">{selectedArticle.category}</span>
                                <span className="text-[10px] text-white/80 font-bold uppercase">{selectedArticle.readTime}</span>
                            </div>
                            <h2 className="text-base md:text-xl font-black text-white leading-tight">{t(selectedArticle.title)}</h2>
                        </div>
                    </div>
                    {/* Scrollable content */}
                    <div className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">
                        <div className="max-w-none text-gray-600 dark:text-gray-300 text-sm leading-relaxed"
                            dangerouslySetInnerHTML={{
                                __html: (selectedArticle.content as string)
                                    .replace(/## (.*?)(\n|$)/g, '<h3 class="text-lg font-black text-gray-900 dark:text-white mt-5 mb-2">$1</h3>')
                                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 dark:text-white">$1</strong>')
                                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                    .replace(/\n- (.*?)(?=\n|$)/g, '<li class="ml-4 mb-1">$1</li>')
                                    .replace(/(<li.*?<\/li>)+/g, (m: string) => `<ul class="list-disc list-inside space-y-1 my-3">${m}</ul>`)
                                    .replace(/\|(.+)\|/g, (row: string) => {
                                        const cells = row.split('|').filter((c: string) => c.trim());
                                        if (cells.every((c: string) => /^-+$/.test(c.trim()))) return '';
                                        return `<tr>${cells.map((c: string) => `<td class="border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs">${c.trim()}</td>`).join('')}</tr>`;
                                    })
                                    .replace(/(<tr>.*<\/tr>)+/g, (m: string) => `<table class="w-full border-collapse my-3 rounded-lg overflow-hidden">${m}</table>`)
                                    .replace(/\n\n/g, '</p><p class="mb-2">')
                                    .replace(/\n/g, '<br/>')
                            }}
                        ></div>
                    </div>
                    {/* Footer */}
                    <div className="flex-shrink-0 p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex justify-end">
                        <button onClick={() => setSelectedArticle(null)} className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-green-700 transition-colors text-sm">
                            {t('Close')}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}

        {/* Add Article Modal */}
        {isAddModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setIsAddModalOpen(false)}>
                <div className="bg-white dark:bg-surface-dark w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                    <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">{t('Add New Article')}</h2>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold mb-2 text-gray-700 dark:text-gray-300">Title</label>
                            <input 
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2 text-gray-700 dark:text-gray-300">Category</label>
                            <select 
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                value={newCategory} onChange={e => setNewCategory(e.target.value)}
                            >
                                {categories.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2 text-gray-700 dark:text-gray-300">Content</label>
                            <textarea 
                                className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 h-32"
                                value={newContent} onChange={e => setNewContent(e.target.value)}
                            ></textarea>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end gap-3">
                        <button onClick={() => setIsAddModalOpen(false)} className="px-5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">{t('Cancel')}</button>
                        <button onClick={handleAddArticle} className="px-5 py-2 rounded-xl bg-primary text-white font-bold">{t('Publish')}</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default LearningCenter;