import { lazy, Suspense } from 'react';
import { Droplets } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import UserView from './components/user/UserView';
import ErrorBoundary from './components/ErrorBoundary';
import ProfileSetup from './components/ProfileSetup';
import { needsProfileSetup } from './auth/profileStatus';

const AdminView = lazy(() => import('./components/admin/AdminView'));
const DesktopSignIn = lazy(() => import('./components/DesktopSignIn'));
const AdminMfaEnrollment = lazy(() => import('./components/AdminMfaEnrollment'));

function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="public-site-theme min-h-screen bg-gradient-to-br from-gray-100 via-amber-50 to-teal-50 flex items-center justify-center" role="status">
      <div className="text-center"><Droplets size={48} className="text-teal-600 mx-auto mb-4 animate-pulse" /><p className="text-gray-500 text-lg">{message}</p></div>
    </div>
  );
}

function Shell() {
  const { authLoading, view, isAdmin, adminEnrollmentRequired, currentUser, accountLoadError, refreshUserProfile, handleSignOut } = useApp();
  if (authLoading) return <LoadingScreen />;
  if (accountLoadError || currentUser?.profileStatus === 'deleting') {
    return <main className="public-site-theme min-h-screen grid place-items-center bg-gray-100 p-6">
      <div className="max-w-lg rounded-xl bg-white p-6">
        <h1 className="text-xl font-bold">Account unavailable</h1>
        <p role="alert" className="my-4">{accountLoadError || 'This account is being deleted. Contact tilleryvolunteeradmin@gmail.com for help.'}</p>
        {accountLoadError && <button className="mr-4 underline" onClick={refreshUserProfile}>Try again</button>}
        <button className="underline" onClick={handleSignOut}>Sign out</button>
      </div>
    </main>;
  }
  if (adminEnrollmentRequired) {
    return <Suspense fallback={<LoadingScreen message="Loading account protection..." />}><AdminMfaEnrollment /></Suspense>;
  }
  if (needsProfileSetup(currentUser)) return <ProfileSetup key={currentUser.id} />;
  if (view === 'user' || !isAdmin) return <UserView />;
  return <Suspense fallback={<LoadingScreen message="Loading admin tools..." />}><AdminView /></Suspense>;
}

export default function App() {
  if (window.location.pathname === '/desktop-sign-in') {
    return <Suspense fallback={<LoadingScreen />}><DesktopSignIn /></Suspense>;
  }
  return (
    <ErrorBoundary>
      <AppProvider><Shell /></AppProvider>
    </ErrorBoundary>
  );
}
