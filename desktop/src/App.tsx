// desktop/src/App.tsx
import AdminGate from './auth/AdminGate';
import { AppProvider, useApp } from './context/AppContext';
import DesktopShell from './components/DesktopShell';
import DocumentViewer from '@app/components/DocumentViewer';

function DesktopDashboard() {
  const { viewingDoc, setViewingDoc } = useApp();
  return (
    <>
      <DesktopShell />
      {viewingDoc && <DocumentViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />}
    </>
  );
}

export default function App() {
  return (
    <AdminGate>
      <AppProvider>
        <DesktopDashboard />
      </AppProvider>
    </AdminGate>
  );
}
