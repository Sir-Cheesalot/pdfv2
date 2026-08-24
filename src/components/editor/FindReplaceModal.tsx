import React, { useState } from 'react';
import { X, Search, Replace, Check } from 'lucide-react';

interface FindReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReplaceAll: (findText: string, replaceText: string, matchCase: boolean) => void;
}

export const FindReplaceModal: React.FC<FindReplaceModalProps> = ({
  isOpen,
  onClose,
  onReplaceAll,
}) => {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);

  if (!isOpen) return null;

  const handleApply = () => {
    if (!findText.trim()) {
      alert('Please enter text to search for.');
      return;
    }
    onReplaceAll(findText, replaceText, matchCase);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-black/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-[#0071e3]/10 text-[#0071e3] rounded-lg">
              <Replace className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Find & Replace</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 hover:bg-black/5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5">
          {/* Find */}
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Find text</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="Text to find..."
                className="w-full bg-slate-50 border border-black/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
              />
            </div>
          </div>

          {/* Replace */}
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Replace with</label>
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replacement text..."
              className="w-full bg-slate-50 border border-black/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
            />
          </div>

          {/* Options */}
          <div className="flex items-center space-x-2 pt-1">
            <label className="flex items-center space-x-1.5 cursor-pointer text-xs text-slate-600">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="rounded text-[#0071e3] focus:ring-0"
              />
              <span>Match case</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-black/5 bg-slate-50 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!findText.trim()}
            className="flex items-center space-x-1 bg-[#0071e3] hover:bg-[#0077ED] text-white text-xs font-medium px-4 py-1.5 rounded-xl shadow-xs disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Replace All</span>
          </button>
        </div>
      </div>
    </div>
  );
};
