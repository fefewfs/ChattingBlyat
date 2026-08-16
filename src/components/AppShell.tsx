import { ReactNode } from 'react';
import {
  LayoutDashboard,
  Swords,
  Search,
  BookOpen,
  Upload,
  TrendingUp,
  Settings,
  Zap,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export type PageKey = 'dashboard' | 'training' | 'search' | 'knowledge' | 'import' | 'progress' | 'settings';

interface NavItem {
  key: PageKey;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Главная', icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  { key: 'training', label: 'Тренировка', icon: <Swords className="w-[18px] h-[18px]" /> },
  { key: 'search', label: 'Поиск', icon: <Search className="w-[18px] h-[18px]" /> },
  { key: 'knowledge', label: 'База знаний', icon: <BookOpen className="w-[18px] h-[18px]" /> },
  { key: 'import', label: 'Импорт', icon: <Upload className="w-[18px] h-[18px]" /> },
  { key: 'progress', label: 'Прогресс', icon: <TrendingUp className="w-[18px] h-[18px]" /> },
  { key: 'settings', label: 'Настройки', icon: <Settings className="w-[18px] h-[18px]" /> },
];

interface AppShellProps {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  children: ReactNode;
}

export function AppShell({ current, onNavigate, children }: AppShellProps) {
  const { user, signOut } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 shrink-0 border-r border-border-subtle bg-bg-secondary/50 backdrop-blur-sm flex flex-col">
        <div className="p-5 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-dim flex items-center justify-center">
              <Zap className="w-5 h-5 text-bg-primary" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">APEX CLOSER</div>
              <div className="text-[10px] text-text-muted font-mono tracking-widest">OS</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`nav-item w-full ${current === item.key ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-border-subtle">
          <div className="flex items-center gap-2 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-bg-tertiary border border-border-default flex items-center justify-center text-xs font-medium text-text-secondary">
              {(user?.email ?? 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-primary truncate">{user?.email}</div>
            </div>
          </div>
          <button onClick={signOut} className="nav-item w-full text-text-muted hover:text-error">
            <LogOut className="w-[18px] h-[18px]" />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
