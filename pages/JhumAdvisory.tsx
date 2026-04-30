import React, { useState } from 'react';
import { toast } from 'sonner';
import { UserProfile } from '../types';

interface JhumAdvisoryProps {
  user?: UserProfile | null;
  language?: string;
  t: (key: string) => string;
}

type Slope = 'gentle' | 'moderate' | 'steep';
type Soil = 'loam' | 'sandy' | 'clay' | 'red';

interface AdvisoryResult {
  recommendedFallowYears: number;
  rotationCrops: string[];
  erosionRisk: 'Low' | 'Moderate' | 'High' | 'Critical';
  erosionScore: number; // 0-100
  warnings: string[];
  recommendations: string[];
  llmInsight?: string;
}

// Jhum (slash-and-burn) rotation logic — based on ICAR-NEH studies and the
// well-documented decline of fallow cycles in the NER from 15+ years to <5.
const NER_CROPS = [
  'Rice (Upland)', 'Maize', 'Foxtail Millet', 'Finger Millet', 'Job\'s Tears',
  'Soybean', 'Black Gram', 'Cowpea', 'King Chilli', 'Ginger',
  'Turmeric', 'Sesame', 'Buckwheat', 'Pumpkin', 'Yam'
];

const ROTATION_RECIPES: Record<string, string[]> = {
  'Rice (Upland)':    ['Soybean', 'Maize', 'Finger Millet'],
  'Maize':            ['Cowpea', 'Foxtail Millet', 'Soybean'],
  'King Chilli':      ['Maize', 'Sesame', 'Buckwheat'],
  'Ginger':           ['Maize', 'Soybean', 'Job\'s Tears'],
  'Turmeric':         ['Cowpea', 'Foxtail Millet', 'Maize'],
  'Foxtail Millet':   ['Black Gram', 'Maize', 'Sesame'],
  'Finger Millet':    ['Cowpea', 'Maize', 'Sesame'],
  'Soybean':          ['Maize', 'Rice (Upland)', 'Finger Millet'],
  'Black Gram':       ['Maize', 'Foxtail Millet', 'Sesame'],
  'Cowpea':           ['Rice (Upland)', 'Maize', 'Sesame'],
  'Sesame':           ['Cowpea', 'Black Gram', 'Foxtail Millet'],
  'Buckwheat':        ['Maize', 'Soybean', 'Finger Millet'],
  'Pumpkin':          ['Maize', 'Soybean', 'Finger Millet'],
  'Yam':              ['Maize', 'Cowpea', 'Soybean'],
  'Job\'s Tears':     ['Soybean', 'Maize', 'Black Gram']
};

const computeAdvisory = (
  crop: string,
  yearsSinceClearing: number,
  slope: Slope,
  soil: Soil
): AdvisoryResult => {
  // Base fallow recommendation: traditional jhum was 15+ years; minimum
  // viable for soil regeneration on NER hillsides is ~7 years (ICAR-NEH).
  let recommendedFallow = 8;
  if (slope === 'gentle') recommendedFallow = 6;
  if (slope === 'steep') recommendedFallow = 12;

  // Soil type adjustment
  if (soil === 'sandy') recommendedFallow += 2;
  if (soil === 'clay') recommendedFallow -= 1;

  // Erosion risk model: shorter cycles + steeper slope = higher risk
  let erosionScore = 30;
  if (slope === 'moderate') erosionScore += 20;
  if (slope === 'steep')    erosionScore += 40;
  if (soil === 'sandy')     erosionScore += 15;
  if (soil === 'red')       erosionScore += 10;
  if (yearsSinceClearing < 3)  erosionScore += 25;
  if (yearsSinceClearing >= 10) erosionScore -= 20;
  erosionScore = Math.max(0, Math.min(100, erosionScore));

  let erosionRisk: AdvisoryResult['erosionRisk'] = 'Low';
  if (erosionScore >= 75) erosionRisk = 'Critical';
  else if (erosionScore >= 55) erosionRisk = 'High';
  else if (erosionScore >= 35) erosionRisk = 'Moderate';

  const warnings: string[] = [];
  if (yearsSinceClearing < recommendedFallow) {
    warnings.push(
      `Plot was last cleared only ${yearsSinceClearing} year${yearsSinceClearing === 1 ? '' : 's'} ago — soil has not fully regenerated. Recommended minimum fallow for this slope/soil: ${recommendedFallow} years.`
    );
  }
  if (erosionScore >= 75) {
    warnings.push('Critical erosion risk: avoid burning slash on this slope. Consider terracing or alley-cropping with Alnus nepalensis.');
  } else if (erosionScore >= 55) {
    warnings.push('High erosion risk: leave 30% of cleared biomass as mulch on contour rather than burning everything.');
  }
  if (slope === 'steep' && (soil === 'sandy' || soil === 'red')) {
    warnings.push('Steep slope + erosion-prone soil: this plot is a candidate for permanent agroforestry conversion (large cardamom under shade) rather than continued jhum.');
  }

  const recommendations: string[] = [];
  recommendations.push(`Sow ${crop} as first year crop after clearing.`);
  const rotation = ROTATION_RECIPES[crop] || ['Maize', 'Soybean', 'Cowpea'];
  rotation.forEach((rc, i) => {
    recommendations.push(`Year ${i + 2}: rotate to ${rc} — restores soil fertility and breaks pest cycles.`);
  });
  recommendations.push(`Year ${rotation.length + 2}+: leave fallow with native shrub cover (Eupatorium or natural regrowth) for ${recommendedFallow} year${recommendedFallow === 1 ? '' : 's'}.`);

  if (erosionScore >= 55) {
    recommendations.push('On contour: dig 50cm-wide × 30cm-deep trenches every 10m to slow runoff.');
    recommendations.push('Plant pineapple or broom-grass (Thysanolaena) along trench edges for additional anchoring.');
  }

  return {
    recommendedFallowYears: recommendedFallow,
    rotationCrops: rotation,
    erosionRisk,
    erosionScore,
    warnings,
    recommendations
  };
};

const JhumAdvisory: React.FC<JhumAdvisoryProps> = ({ user, language, t }) => {
  const [crop, setCrop] = useState<string>('Rice (Upland)');
  const [yearsSinceClearing, setYearsSinceClearing] = useState<number>(2);
  const [slope, setSlope] = useState<Slope>('moderate');
  const [soil, setSoil] = useState<Soil>('loam');
  const [result, setResult] = useState<AdvisoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    setResult(null);
    // Lightweight rule-based result is instant, but we simulate a small delay
    // so the UI flow feels deliberate.
    await new Promise(r => setTimeout(r, 250));
    const advisory = computeAdvisory(crop, yearsSinceClearing, slope, soil);
    setResult(advisory);
    setLoading(false);

    // Fire LLM augmentation in background (non-blocking)
    setLlmLoading(true);
    try {
      const { translateContent } = await import('../services/GeminiService');
      const { getChatCompletion } = await import('../services/GeminiService');
      const lang = language || 'English';
      const prompt = `You are an ICAR-NEH agronomist. A farmer in the North-East Indian region is planning a jhum (shifting cultivation) cycle. Plot details: primary crop = ${crop}, last cleared = ${yearsSinceClearing} year(s) ago, slope = ${slope}, soil = ${soil}, erosion risk = ${advisory.erosionRisk}. In 3 short bullet points (max 30 words each), give the most important practical advice specific to NER conditions. Reply in ${lang.split('(')[0].trim()}. No preamble.`;
      const response = await getChatCompletion([{ role: 'user', parts: [{ text: prompt }] }]);
      if (response && !response.includes('having trouble')) {
        setResult(prev => prev ? { ...prev, llmInsight: response } : prev);
      }
    } catch (err) {
      // Silent fail — local advisory is still shown
      console.warn('LLM augmentation failed:', err);
    } finally {
      setLlmLoading(false);
    }
  };

  const riskColor = (risk: AdvisoryResult['erosionRisk']) => {
    switch (risk) {
      case 'Critical': return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300';
      case 'High':     return 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/40 dark:text-orange-300';
      case 'Moderate': return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300';
      default:         return 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300';
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-700 via-primary to-emerald-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full text-xs font-bold mb-3 backdrop-blur-sm">
            <span className="material-icons-round text-sm">forest</span>
            NER Agroforestry
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-2">Jhum Rotation Advisory</h1>
          <p className="text-emerald-100/90 text-sm md:text-base max-w-2xl">
            Plan your shifting cultivation cycle based on slope, soil, and time since last clearing.
            Recommendations are calibrated for NER hill-slope agriculture and ICAR-NEH research.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
        <h2 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
          <span className="material-icons-round text-primary">tune</span>
          Plot details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Primary crop */}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Primary crop</label>
            <select
              value={crop}
              onChange={e => setCrop(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/30 outline-none font-medium"
            >
              {NER_CROPS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Years since clearing */}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">
              Years since last cleared
            </label>
            <input
              type="number"
              min={0}
              max={30}
              value={yearsSinceClearing}
              onChange={e => setYearsSinceClearing(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/30 outline-none font-medium"
            />
          </div>

          {/* Slope */}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Slope</label>
            <div className="grid grid-cols-3 gap-2">
              {(['gentle', 'moderate', 'steep'] as Slope[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSlope(s)}
                  className={`py-3 rounded-xl text-sm font-bold capitalize transition-all border-2 ${
                    slope === s
                      ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-transparent hover:border-primary/30'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Soil */}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">Soil type</label>
            <div className="grid grid-cols-4 gap-2">
              {(['loam', 'sandy', 'clay', 'red'] as Soil[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSoil(s)}
                  className={`py-3 rounded-xl text-xs font-bold capitalize transition-all border-2 ${
                    soil === s
                      ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-transparent hover:border-primary/30'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-base shadow-lg shadow-primary/25 hover:bg-emerald-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <span className="material-icons-round">insights</span>
              Generate Rotation Plan
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Risk + fallow summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`rounded-3xl p-6 border ${riskColor(result.erosionRisk)}`}>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Erosion Risk</p>
              <p className="text-3xl font-extrabold">{result.erosionRisk}</p>
              <p className="text-xs mt-2 opacity-80">Score: {result.erosionScore}/100</p>
              <div className="mt-3 h-2 bg-black/10 rounded-full overflow-hidden">
                <div className="h-full bg-current opacity-60" style={{ width: `${result.erosionScore}%` }} />
              </div>
            </div>

            <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 border border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Recommended Fallow</p>
              <p className="text-3xl font-extrabold text-slate-800 dark:text-white">{result.recommendedFallowYears} <span className="text-lg font-bold text-slate-400">years</span></p>
              <p className="text-xs mt-2 text-slate-500">After your rotation cycle ends</p>
            </div>

            <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 border border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Rotation Length</p>
              <p className="text-3xl font-extrabold text-slate-800 dark:text-white">{result.rotationCrops.length + 1} <span className="text-lg font-bold text-slate-400">years</span></p>
              <p className="text-xs mt-2 text-slate-500">Active cropping before fallow</p>
            </div>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-3xl p-5">
              <h3 className="font-bold text-orange-900 dark:text-orange-300 mb-3 flex items-center gap-2">
                <span className="material-icons-round">warning_amber</span>
                Site warnings
              </h3>
              <ul className="space-y-2">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-orange-800 dark:text-orange-300/90 flex gap-2">
                    <span className="text-orange-500 font-black mt-0.5">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Year-by-year plan */}
          <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 border border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <span className="material-icons-round text-primary">timeline</span>
              Recommended cropping sequence
            </h3>
            <ol className="space-y-3">
              {result.recommendations.map((r, i) => (
                <li key={i} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{r}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* LLM augmentation */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-3xl p-6">
            <h3 className="font-bold text-indigo-900 dark:text-indigo-300 mb-3 flex items-center gap-2">
              <span className="material-icons-round">auto_awesome</span>
              AI agronomist insights
              {llmLoading && <span className="text-xs font-medium text-indigo-500 animate-pulse">thinking…</span>}
            </h3>
            {result.llmInsight ? (
              <p className="text-sm text-indigo-900/90 dark:text-indigo-200/90 leading-relaxed whitespace-pre-line">{result.llmInsight}</p>
            ) : llmLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-indigo-200/50 dark:bg-indigo-800/50 rounded w-full" />
                <div className="h-3 bg-indigo-200/50 dark:bg-indigo-800/50 rounded w-5/6" />
                <div className="h-3 bg-indigo-200/50 dark:bg-indigo-800/50 rounded w-2/3" />
              </div>
            ) : (
              <p className="text-sm text-indigo-700/70 dark:text-indigo-300/70">
                AI insights unavailable offline. The rule-based recommendations above are still calibrated for NER conditions.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JhumAdvisory;
