import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { UserProfile } from '../types';

interface AshaReportProps {
  user?: UserProfile | null;
  t: (key: string) => string;
}

interface FieldReport {
  id: string;
  district: string;
  state: string;
  crop: string;
  disease: string;
  severity: 'Low' | 'Moderate' | 'High' | 'Critical';
  affectedFarmers: number;
  reporter: string;
  timestamp: number;
}

const NE_DISTRICTS: { state: string; districts: string[] }[] = [
  { state: 'Assam',             districts: ['Kamrup', 'Dibrugarh', 'Jorhat', 'Tinsukia', 'Cachar', 'Nagaon'] },
  { state: 'Arunachal Pradesh', districts: ['Itanagar', 'Ziro', 'Tawang', 'Pasighat', 'Roing'] },
  { state: 'Manipur',           districts: ['Imphal East', 'Imphal West', 'Bishnupur', 'Senapati', 'Ukhrul'] },
  { state: 'Meghalaya',         districts: ['East Khasi Hills', 'West Khasi Hills', 'Ri Bhoi', 'Jaintia Hills', 'Garo Hills'] },
  { state: 'Mizoram',           districts: ['Aizawl', 'Lunglei', 'Champhai', 'Kolasib', 'Serchhip'] },
  { state: 'Nagaland',          districts: ['Kohima', 'Dimapur', 'Mokokchung', 'Mon', 'Wokha'] },
  { state: 'Sikkim',            districts: ['East Sikkim', 'West Sikkim', 'North Sikkim', 'South Sikkim'] },
  { state: 'Tripura',           districts: ['West Tripura', 'South Tripura', 'Dhalai', 'North Tripura'] }
];

const COMMON_NER_CROPS = [
  'Areca Nut', 'Large Cardamom', 'Ginger', 'Turmeric', 'Black Rice (Chakhao)',
  'King Chilli (Bhut Jolokia)', 'Kiwi', 'Khasi Mandarin', 'Tea', 'Bamboo',
  'Rice (Upland)', 'Maize', 'Soybean'
];

const COMMON_DISEASES = [
  'Healthy', 'Yellow Leaf Disease', 'Mahali (Fruit Rot)', 'Chirke (Mosaic Virus)',
  'Foorkey', 'Soft Rot', 'Bacterial Wilt', 'Leaf Blotch', 'Rhizome Rot',
  'Blast', 'Anthracnose', 'Leaf Curl Virus', 'Bacterial Canker (Psa)',
  'Citrus Greening (HLB)', 'Citrus Canker', 'Blister Blight', 'Red Rust', 'Other'
];

const STORAGE_KEY = 'kropscan_asha_reports';

const loadReports = (): FieldReport[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const saveReports = (reports: FieldReport[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (e) {
    console.warn('Failed to persist ASHA reports', e);
  }
};

const seedDemoReports = (): FieldReport[] => {
  // One-time demo seeding to make the heatmap meaningful for the pitch.
  const now = Date.now();
  const demo: FieldReport[] = [
    { id: 's1', state: 'Sikkim',    district: 'East Sikkim',       crop: 'Large Cardamom',  disease: 'Chirke (Mosaic Virus)', severity: 'High',     affectedFarmers: 24, reporter: 'demo-asha-01', timestamp: now - 86400000 * 3 },
    { id: 's2', state: 'Sikkim',    district: 'North Sikkim',      crop: 'Large Cardamom',  disease: 'Foorkey',                severity: 'Critical', affectedFarmers: 11, reporter: 'demo-asha-01', timestamp: now - 86400000 * 1 },
    { id: 's3', state: 'Meghalaya', district: 'East Khasi Hills',  crop: 'Khasi Mandarin',  disease: 'Citrus Greening (HLB)', severity: 'High',     affectedFarmers: 18, reporter: 'demo-asha-02', timestamp: now - 86400000 * 5 },
    { id: 's4', state: 'Manipur',   district: 'Bishnupur',         crop: 'Black Rice (Chakhao)', disease: 'Blast',             severity: 'Moderate', affectedFarmers: 32, reporter: 'demo-asha-03', timestamp: now - 86400000 * 2 },
    { id: 's5', state: 'Nagaland',  district: 'Mon',               crop: 'King Chilli (Bhut Jolokia)', disease: 'Anthracnose', severity: 'High',     affectedFarmers: 9,  reporter: 'demo-asha-04', timestamp: now - 86400000 * 4 },
    { id: 's6', state: 'Assam',     district: 'Dibrugarh',         crop: 'Tea',             disease: 'Blister Blight',         severity: 'Moderate', affectedFarmers: 41, reporter: 'demo-asha-05', timestamp: now - 86400000 * 6 }
  ];
  saveReports(demo);
  return demo;
};

const severityScore = (s: FieldReport['severity']) => {
  switch (s) { case 'Critical': return 4; case 'High': return 3; case 'Moderate': return 2; default: return 1; }
};

const severityColor = (s: FieldReport['severity']) => {
  switch (s) {
    case 'Critical': return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-300';
    case 'High':     return 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-300';
    case 'Moderate': return 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-300';
    default:         return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-300';
  }
};

const heatColor = (intensity: number) => {
  // intensity 0..1 → green→amber→red gradient
  if (intensity > 0.75) return 'bg-red-500/80 text-white';
  if (intensity > 0.5)  return 'bg-orange-500/70 text-white';
  if (intensity > 0.25) return 'bg-amber-400/70 text-slate-900';
  if (intensity > 0)    return 'bg-emerald-300/60 text-slate-800';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-400';
};

const AshaReport: React.FC<AshaReportProps> = ({ user, t }) => {
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [view, setView] = useState<'heatmap' | 'submit' | 'list'>('heatmap');

  // Form state
  const [state, setState] = useState<string>(NE_DISTRICTS[0].state);
  const [district, setDistrict] = useState<string>(NE_DISTRICTS[0].districts[0]);
  const [crop, setCrop] = useState<string>(COMMON_NER_CROPS[0]);
  const [disease, setDisease] = useState<string>(COMMON_DISEASES[0]);
  const [severity, setSeverity] = useState<FieldReport['severity']>('Moderate');
  const [affectedFarmers, setAffectedFarmers] = useState<number>(1);

  useEffect(() => {
    let existing = loadReports();
    if (existing.length === 0) existing = seedDemoReports();
    setReports(existing);
  }, []);

  const districtsForState = useMemo(
    () => NE_DISTRICTS.find(s => s.state === state)?.districts || [],
    [state]
  );

  // Aggregation: state × disease severity heatmap
  const stateSeverityMatrix = useMemo(() => {
    const matrix: Record<string, { totalScore: number; reports: number; affected: number }> = {};
    NE_DISTRICTS.forEach(s => {
      matrix[s.state] = { totalScore: 0, reports: 0, affected: 0 };
    });
    reports.forEach(r => {
      if (!matrix[r.state]) matrix[r.state] = { totalScore: 0, reports: 0, affected: 0 };
      matrix[r.state].totalScore += severityScore(r.severity) * Math.max(1, Math.log10(r.affectedFarmers + 1) + 1);
      matrix[r.state].reports += 1;
      matrix[r.state].affected += r.affectedFarmers;
    });
    const maxScore = Math.max(0.01, ...Object.values(matrix).map(m => m.totalScore));
    return { matrix, maxScore };
  }, [reports]);

  const totalAffected = reports.reduce((s, r) => s + r.affectedFarmers, 0);
  const criticalReports = reports.filter(r => r.severity === 'Critical').length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const report: FieldReport = {
      id: `r${Date.now()}`,
      state,
      district,
      crop,
      disease,
      severity,
      affectedFarmers: Math.max(1, affectedFarmers),
      reporter: user?.uid || user?.id?.toString() || 'anonymous-asha',
      timestamp: Date.now()
    };
    const updated = [report, ...reports];
    setReports(updated);
    saveReports(updated);
    toast.success(`Report submitted: ${disease} in ${district}, ${state}`);
    setView('heatmap');
    // Reset minor fields
    setAffectedFarmers(1);
  };

  const tabs: { id: typeof view; label: string; icon: string }[] = [
    { id: 'heatmap', label: 'District Heatmap', icon: 'map' },
    { id: 'submit',  label: 'New Field Report', icon: 'add_circle' },
    { id: 'list',    label: 'All Reports',      icon: 'list_alt' }
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-br from-rose-700 via-pink-700 to-rose-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full text-xs font-bold mb-3 backdrop-blur-sm">
              <span className="material-icons-round text-sm">health_and_safety</span>
              ASHA Field Mode
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold mb-2">District Disease Surveillance</h1>
            <p className="text-rose-100/90 text-sm md:text-base max-w-2xl">
              Crop-disease reporting across NE districts by ASHA workers, KVK officers, and field volunteers.
              Aggregated anonymously to flag outbreak hotspots.
            </p>
          </div>
          <div className="flex md:flex-col gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-2 border border-white/10">
              <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">Total reports</p>
              <p className="text-2xl font-extrabold">{reports.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-2 border border-white/10">
              <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">Farmers affected</p>
              <p className="text-2xl font-extrabold">{totalAffected.toLocaleString()}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-2 border border-white/10">
              <p className="text-[10px] uppercase tracking-widest font-bold opacity-70">Critical</p>
              <p className="text-2xl font-extrabold">{criticalReports}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all whitespace-nowrap ${
              view === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/25'
                : 'bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary/30'
            }`}
          >
            <span className="material-icons-round text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Heatmap */}
      {view === 'heatmap' && (
        <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-1 flex items-center gap-2">
            <span className="material-icons-round text-primary">leaderboard</span>
            State-level disease pressure
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Severity-weighted by affected-farmer count. Higher intensity = more urgent intervention.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {NE_DISTRICTS.map(s => {
              const cell = stateSeverityMatrix.matrix[s.state] || { totalScore: 0, reports: 0, affected: 0 };
              const intensity = stateSeverityMatrix.maxScore > 0 ? cell.totalScore / stateSeverityMatrix.maxScore : 0;
              return (
                <div
                  key={s.state}
                  className={`rounded-2xl p-4 border border-white/30 dark:border-black/30 transition-all hover:scale-[1.02] cursor-default ${heatColor(intensity)}`}
                >
                  <p className="text-xs font-black uppercase tracking-widest opacity-90 mb-1">{s.state}</p>
                  <p className="text-2xl font-extrabold">{cell.reports}</p>
                  <p className="text-[10px] opacity-80 font-medium">
                    {cell.affected} farmer{cell.affected === 1 ? '' : 's'} affected
                  </p>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-6 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-bold uppercase tracking-widest">Pressure</span>
            <div className="flex-1 h-3 rounded-full bg-gradient-to-r from-slate-100 via-emerald-300 via-amber-400 via-orange-500 to-red-500 dark:from-slate-800" />
            <span className="font-medium">low → critical</span>
          </div>

          {/* Top diseases */}
          <div className="mt-8">
            <h3 className="font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
              <span className="material-icons-round text-orange-500">trending_up</span>
              Top reported diseases (by affected farmers)
            </h3>
            <div className="space-y-2">
              {(() => {
                const byDisease: Record<string, { affected: number; reports: number; topSeverity: number }> = {};
                reports.forEach(r => {
                  const k = r.disease;
                  if (!byDisease[k]) byDisease[k] = { affected: 0, reports: 0, topSeverity: 0 };
                  byDisease[k].affected += r.affectedFarmers;
                  byDisease[k].reports += 1;
                  byDisease[k].topSeverity = Math.max(byDisease[k].topSeverity, severityScore(r.severity));
                });
                const sorted = Object.entries(byDisease)
                  .sort(([, a], [, b]) => b.affected - a.affected)
                  .slice(0, 5);
                if (sorted.length === 0) {
                  return <p className="text-sm text-slate-400">No reports yet.</p>;
                }
                const maxAff = sorted[0][1].affected || 1;
                return sorted.map(([d, info]) => (
                  <div key={d} className="flex items-center gap-3">
                    <div className="w-1/3 text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{d}</div>
                    <div className="flex-1 h-7 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden relative">
                      <div
                        className={`h-full rounded-lg ${
                          info.topSeverity >= 4 ? 'bg-red-500' :
                          info.topSeverity >= 3 ? 'bg-orange-500' :
                          info.topSeverity >= 2 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${(info.affected / maxAff) * 100}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                        {info.affected} farmers · {info.reports} report{info.reports === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Submit form */}
      {view === 'submit' && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-surface-dark rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
          <h2 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2">
            <span className="material-icons-round text-primary">edit_note</span>
            Submit field report
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">State</label>
              <select
                value={state}
                onChange={e => {
                  setState(e.target.value);
                  const ds = NE_DISTRICTS.find(s => s.state === e.target.value)?.districts || [];
                  setDistrict(ds[0] || '');
                }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/30 outline-none font-medium"
              >
                {NE_DISTRICTS.map(s => <option key={s.state} value={s.state}>{s.state}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">District</label>
              <select
                value={district}
                onChange={e => setDistrict(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/30 outline-none font-medium"
              >
                {districtsForState.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Crop</label>
              <select
                value={crop}
                onChange={e => setCrop(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/30 outline-none font-medium"
              >
                {COMMON_NER_CROPS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Disease / status</label>
              <select
                value={disease}
                onChange={e => setDisease(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/30 outline-none font-medium"
              >
                {COMMON_DISEASES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Severity</label>
              <div className="grid grid-cols-4 gap-2">
                {(['Low', 'Moderate', 'High', 'Critical'] as FieldReport['severity'][]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={`py-3 rounded-xl text-xs font-bold transition-all border-2 ${
                      severity === s
                        ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-transparent hover:border-primary/30'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Farmers affected</label>
              <input
                type="number"
                min={1}
                value={affectedFarmers}
                onChange={e => setAffectedFarmers(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/30 outline-none font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-base shadow-lg shadow-primary/25 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-icons-round">cloud_upload</span>
            Submit report
          </button>
        </form>
      )}

      {/* List */}
      {view === 'list' && (
        <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <span className="material-icons-round text-primary">receipt_long</span>
            All field reports
          </h2>
          {reports.length === 0 ? (
            <p className="text-sm text-slate-400">No reports yet — submit your first.</p>
          ) : (
            <div className="space-y-3">
              {reports.map(r => (
                <div key={r.id} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${severityColor(r.severity)}`}>
                    {r.severity}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 dark:text-white truncate">
                      {r.disease} <span className="text-slate-400 font-normal">on</span> {r.crop}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {r.district}, {r.state} · {r.affectedFarmers} farmer{r.affectedFarmers === 1 ? '' : 's'} · {new Date(r.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AshaReport;
