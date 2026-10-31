type PoolstersBrandProps = { className?: string };

export default function PoolstersBrand({ className = "" }: PoolstersBrandProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200 dark:bg-gray-900 dark:ring-gray-700" aria-hidden="true">
        <svg viewBox="0 0 48 48" className="h-11 w-11" role="img">
          <circle cx="24" cy="24" r="20" fill="#fff" stroke="#dbe4ee" strokeWidth="1.5" />
          <path d="M13 10c8 5 14 14 15 27M35 10c-8 5-14 14-15 27" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeDasharray="2.2 3.1" />
        </svg>
      </span>
      <span className="min-w-0 text-left leading-none">
        <span className="block -skew-x-6 text-3xl font-black italic tracking-[-0.08em] text-blue-800 dark:text-blue-300">Poolsters</span>
        <span className="mt-1 block text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Dynasty Baseball League</span>
      </span>
    </div>
  );
}
