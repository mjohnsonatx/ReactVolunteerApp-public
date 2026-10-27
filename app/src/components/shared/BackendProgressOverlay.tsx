import { Loader2 } from 'lucide-react';

export default function BackendProgressOverlay({ message }: { message: string }) {
  return (
    <div
      className="fixed inset-0 z-[5000] bg-slate-950/45 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 px-6 py-5 min-w-[280px] max-w-sm text-center">
        <Loader2 size={34} className="animate-spin text-teal-600 mx-auto mb-3" />
        <p className="font-semibold text-gray-800">{message}</p>
        <p className="text-xs text-gray-500 mt-1">Please wait until this finishes.</p>
      </div>
    </div>
  );
}
