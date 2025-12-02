import React from 'react';
import { TriageData, Urgency } from '../types';
import { Activity, AlertTriangle, CheckCircle, Brain, Tag, ShieldAlert } from 'lucide-react';

interface TriagePanelProps {
  data: TriageData | null;
}

const TriagePanel: React.FC<TriagePanelProps> = ({ data }) => {
  if (!data) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
        <Brain className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">AI Analysis will appear here after the first interaction.</p>
      </div>
    );
  }

  const getUrgencyColor = (u: string) => {
    switch (u?.toUpperCase()) {
      case Urgency.CRITICAL: return 'bg-red-100 text-red-700 border-red-200';
      case Urgency.HIGH: return 'bg-orange-100 text-orange-700 border-orange-200';
      case Urgency.MEDIUM: return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-green-100 text-green-700 border-green-200';
    }
  };

  const getUrgencyIcon = (u: string) => {
    switch (u?.toUpperCase()) {
      case Urgency.CRITICAL: return <ShieldAlert className="w-5 h-5" />;
      case Urgency.HIGH: return <AlertTriangle className="w-5 h-5" />;
      case Urgency.MEDIUM: return <Activity className="w-5 h-5" />;
      default: return <CheckCircle className="w-5 h-5" />;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal-600" />
          <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wider">Live Triage Analysis</h3>
        </div>
        {/* Model info moved here under the header */}
        {data.modelUsed && (
          <div className="ml-6 mt-0.5 flex items-center gap-1">
            <span className="text-[10px] text-slate-400 lowercase">current model:</span>
            <span className="text-[10px] font-mono font-bold text-slate-600">{data.modelUsed}</span>
          </div>
        )}
      </div>
      
      <div className="p-5 space-y-6 overflow-y-auto flex-1">
        
        {/* Urgency Status */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-400 uppercase">Urgency Level</span>
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border ${getUrgencyColor(data.urgency as string)}`}>
            {getUrgencyIcon(data.urgency as string)}
            <span className="font-bold tracking-wide">{data.urgency}</span>
          </div>
        </div>

        {/* Topic */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-400 uppercase">Detected Topic</span>
          <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <Brain className="w-4 h-4 text-teal-500" />
            <span className="font-medium">{data.topic}</span>
          </div>
        </div>

        {/* Action */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-400 uppercase">Suggested Action</span>
          <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed">
            {data.suggested_action}
          </div>
        </div>

        {/* Keywords */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-400 uppercase">Flagged Keywords</span>
          <div className="flex flex-wrap gap-2">
            {data.flagged_keywords && data.flagged_keywords.length > 0 ? (
              data.flagged_keywords.map((kw, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                  <Tag className="w-3 h-3" />
                  {kw}
                </span>
              ))
            ) : (
              <span className="text-slate-400 text-sm italic">No keywords flagged</span>
            )}
          </div>
        </div>

      </div>
      
      <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 text-center">
        AI-generated analysis. Not a clinical diagnosis.
      </div>
    </div>
  );
};

export default TriagePanel;