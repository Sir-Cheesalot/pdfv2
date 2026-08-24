'use client';

import dynamic from 'next/dynamic';

const SpliceStudio = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen bg-[#f5f5f7] flex flex-col items-center justify-center space-y-3">
      <div className="w-8 h-8 border-2 border-slate-300 border-t-[#0071e3] rounded-full animate-spin" />
      <div className="text-xs font-medium text-slate-500">Loading...</div>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#f5f5f7]">
      <SpliceStudio />
    </main>
  );
}
