import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AuthPage } from '@/pages/AuthPage';
import { AppShell, type PageKey } from '@/components/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { TrainingPage } from '@/pages/TrainingPage';
import { SearchPage } from '@/pages/SearchPage';
import { KnowledgePage } from '@/pages/KnowledgePage';
import { ImportPage } from '@/pages/ImportPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { session, loading } = useAuth();
  const [page, setPage] = useState<PageKey>('dashboard');

  useEffect(() => {
    if (!session) setPage('dashboard');
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 spin text-accent" />
      </div>
    );
  }

  if (!session) return <AuthPage />;

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard onNavigate={setPage} />;
      case 'training':
        return <TrainingPage />;
      case 'search':
        return <SearchPage onNavigate={setPage} />;
      case 'knowledge':
        return <KnowledgePage onNavigate={setPage} />;
      case 'import':
        return <ImportPage onNavigate={setPage} />;
      case 'progress':
        return <ProgressPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard onNavigate={setPage} />;
    }
  };

  return (
    <AppShell current={page} onNavigate={setPage}>
      {renderPage()}
    </AppShell>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
