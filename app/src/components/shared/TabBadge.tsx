// components/shared/TabBadge.jsx
export default function TabBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-red-500 text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}