// components/shared/AccountMenu.jsx
import { User, Shield, LogOut } from 'lucide-react';
import { useApp } from '@runtime/app-context';

export default function AccountMenu({ embedded = false, adminOnly = false }: { embedded?: boolean; adminOnly?: boolean }) {
  const {
    currentUser, isAdmin, view, setView, setPage, setSelectedPost,
    accountMenuOpen, setAccountMenuOpen, handleSignOut, setAuthMode, setShowAuthModal,
  } = useApp();
  const username = currentUser?.userName || 'there';

  return (
    <div className={embedded ? 'relative z-[3000] flex-shrink-0' : 'fixed top-4 right-4 z-[3000]'}>
      {currentUser ? (
        <div className="relative">
          <button
            onClick={() => setAccountMenuOpen(o => !o)}
            aria-label="Account menu"
            className="h-11 max-w-[11rem] rounded-full bg-teal-500 hover:bg-teal-600 text-white flex items-center gap-2 px-3 shadow-lg ring-2 ring-white"
          >
            <User size={20} className="flex-shrink-0" />
            <span className={`text-sm font-semibold truncate ${embedded ? 'hidden sm:block' : ''}`}>Hi, {username}</span>
          </button>
          {accountMenuOpen && (
            <>
              <div className="fixed inset-0 z-[2999]" onClick={() => setAccountMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[3001]">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="font-semibold text-gray-800 truncate">{currentUser.userName ? `@${currentUser.userName}` : 'Account'}</p>
                  <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
                </div>
                {!adminOnly && (
                  <>
                    <button
                      onClick={() => { setView('user'); setPage('profile'); setSelectedPost(null); setAccountMenuOpen(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <User size={16} /> My Profile
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => { setView(view === 'admin' ? 'user' : 'admin'); setAccountMenuOpen(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Shield size={16} /> {view === 'admin' ? 'Switch to User View' : 'Switch to Admin Panel'}
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => { handleSignOut(); setAccountMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      ) : !adminOnly ? (
        <button
          onClick={() => { setAuthMode('signin'); setShowAuthModal(true); }}
          aria-label="Sign In"
          className={embedded
            ? 'w-11 h-11 rounded-full bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center shadow-lg ring-2 ring-white'
            : 'flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg text-sm font-medium text-gray-700 hover:bg-gray-50'}
        >
          <User size={embedded ? 20 : 18} />{!embedded && ' Sign In'}
        </button>
      ) : null}
    </div>
  );
}
