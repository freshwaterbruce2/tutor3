import {
  Award,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Eye,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Menu,
  Music,
  Play,
  ShoppingBag,
  Sparkles,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { HomeworkItem, HomeworkStep, View } from '../../types';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  userName?: string;
  userTokens?: number;
  activeAssignment?: HomeworkItem | null;
  activeStep?: HomeworkStep | null;
  onStartFocusStep?: () => void;
  onOpenTutorStep?: () => void;
}

interface PrimaryNavItem {
  id: View;
  matchViews: View[];
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
}

interface SecondaryNavItem {
  id: View;
  label: string;
  icon: LucideIcon;
}

const PRIMARY_DESTINATIONS: PrimaryNavItem[] = [
  {
    id: 'dashboard',
    matchViews: ['dashboard'],
    label: 'Today',
    shortLabel: 'Today',
    description: 'Assignments & next steps',
    icon: LayoutDashboard,
  },
  {
    id: 'tutor',
    matchViews: ['tutor'],
    label: 'Tutor',
    shortLabel: 'Tutor',
    description: 'Guided homework help',
    icon: GraduationCap,
  },
  {
    id: 'cards',
    matchViews: ['cards', 'games'],
    label: 'Practice',
    shortLabel: 'Practice',
    description: 'Subject Realms & Brain Gym',
    icon: BookOpen,
  },
  {
    id: 'achievements',
    matchViews: ['achievements'],
    label: 'Progress',
    shortLabel: 'Progress',
    description: 'Completed work & goals',
    icon: Award,
  },
];

const SECONDARY_TOOLS: SecondaryNavItem[] = [
  { id: 'focus', label: 'Focus Timer', icon: Clock },
  { id: 'friend', label: 'Study Buddy', icon: Heart },
  { id: 'schedules', label: 'Daily Routine', icon: Calendar },
  { id: 'music', label: 'Study Radio', icon: Music },
  { id: 'wellness', label: 'Mindful Corner', icon: Sparkles },
  { id: 'shop', label: 'Avatar & Shop', icon: ShoppingBag },
  { id: 'tokens', label: 'Token Ledger', icon: Coins },
  { id: 'sensory', label: 'Appearance & Comfort', icon: Eye },
  { id: 'parent', label: 'Parent Zone', icon: UserCheck },
];

const Sidebar = ({
  currentView,
  onNavigate,
  isCollapsed,
  onToggle,
  userName,
  userTokens = 0,
  activeAssignment,
  activeStep,
  onStartFocusStep,
  onOpenTutorStep,
}: SidebarProps) => {
  const [isMoreDrawerOpen, setIsMoreDrawerOpen] = useState(false);

  const handleNavClick = (view: View) => {
    onNavigate(view);
    setIsMoreDrawerOpen(false);
  };

  const isSecondaryActive = SECONDARY_TOOLS.some((item) => item.id === currentView);

  return (
    <>
      {/* Desktop Compact Sidebar (Single primary navigation system on desktop) */}
      <aside
        aria-label="Main navigation"
        className={`hidden md:flex flex-col h-full shrink-0 border-r border-[var(--border-color)] bg-[var(--background-card)] transition-all duration-200 select-none ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className="px-4 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 text-left min-w-0 group"
          >
            <div className="w-9 h-9 rounded-xl bg-[#0F766E] text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-xs">
              VT
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="font-bold text-base text-[var(--text-primary)] tracking-tight leading-tight truncate font-display">
                  VibeTutor 2.0
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">
                  One step at a time
                </div>
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--background-main)] transition-colors shrink-0"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* 4 Primary Destinations */}
        <nav aria-label="Primary destinations" className="p-3 space-y-1">
          {PRIMARY_DESTINATIONS.map((item) => {
            const Icon = item.icon;
            const isActive = item.matchViews.includes(currentView);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                aria-current={isActive ? 'page' : undefined}
                title={isCollapsed ? `${item.label} — ${item.description}` : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  isActive
                    ? 'bg-[#0F766E] text-white font-semibold shadow-xs'
                    : 'text-[var(--text-primary)] hover:bg-[var(--background-surface)]'
                } ${isCollapsed ? 'justify-center' : ''}`}
              >
                <Icon
                  size={20}
                  className={isActive ? 'text-white shrink-0' : 'text-[#0F766E] shrink-0'}
                />
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-tight truncate">{item.label}</div>
                    <div
                      className={`text-[11px] truncate ${
                        isActive ? 'text-teal-100' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Current Assignment Context Card (persists across Today, Tutor, Focus) */}
        {!isCollapsed && activeAssignment && (
          <div className="mx-3 my-2 p-3 rounded-xl bg-[#EAF6F0] border border-[#0F766E]/20">
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#0F766E]">
                Working On Now
              </span>
              <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
                {activeAssignment.subject}
              </span>
            </div>
            <p className="text-xs font-bold text-[var(--text-primary)] line-clamp-1">
              {activeAssignment.title}
            </p>
            {activeStep && (
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                Step: {activeStep.text}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => (onStartFocusStep ? onStartFocusStep() : onNavigate('focus'))}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0F766E] text-white hover:bg-[#115E59] transition-colors"
              >
                <Play size={11} />
                Focus
              </button>
              <button
                type="button"
                onClick={() => (onOpenTutorStep ? onOpenTutorStep() : onNavigate('tutor'))}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-white text-[#0F766E] border border-[#0F766E]/30 hover:bg-teal-50 transition-colors"
              >
                <GraduationCap size={12} />
                Tutor
              </button>
            </div>
          </div>
        )}

        {/* Secondary Study Tools & Settings */}
        <div className="flex-1 overflow-y-auto px-3 py-2 border-t border-[var(--border-subtle)]">
          {!isCollapsed && (
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Tools &amp; Settings
            </div>
          )}
          <div className="space-y-0.5">
            {SECONDARY_TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive = currentView === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleNavClick(tool.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={isCollapsed ? tool.label : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#EFEAFA] text-[#1F2937] font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--background-main)] hover:text-[var(--text-primary)]'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                >
                  <Icon size={16} className="shrink-0 text-[var(--text-secondary)]" />
                  {!isCollapsed && <span className="truncate flex-1 text-left">{tool.label}</span>}
                  {!isCollapsed && tool.id === 'tokens' && (
                    <span className="text-[11px] font-mono font-semibold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded">
                      {userTokens}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Compact Student Status Footer */}
        {!isCollapsed && (
          <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--background-main)]/60 flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="truncate font-medium">
              {userName ? `Student: ${userName}` : 'Saved on this device'}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('sensory')}
              className="text-[#0F766E] font-semibold hover:underline shrink-0"
            >
              Appearance
            </button>
          </div>
        )}
      </aside>

      {/* Mobile Bottom Navigation Bar (Single primary navigation system on mobile) */}
      <nav
        aria-label="Mobile primary navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--background-card)] border-t border-[var(--border-color)] px-2 py-1.5 flex items-center justify-around shadow-lg"
      >
        {PRIMARY_DESTINATIONS.map((item) => {
          const Icon = item.icon;
          const isActive = item.matchViews.includes(currentView);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[48px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors ${
                isActive ? 'text-[#0F766E] bg-[#EAF6F0]' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={19} />
              <span className="mt-0.5 text-[11px] leading-none">{item.shortLabel}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setIsMoreDrawerOpen((prev) => !prev)}
          aria-expanded={isMoreDrawerOpen}
          className={`flex flex-col items-center justify-center min-h-[48px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors ${
            isSecondaryActive || isMoreDrawerOpen
              ? 'text-[#0F766E] bg-[#EAF6F0]'
              : 'text-[var(--text-secondary)]'
          }`}
        >
          <Menu size={19} />
          <span className="mt-0.5 text-[11px] leading-none">More</span>
        </button>
      </nav>

      {/* Mobile Secondary Tools Drawer */}
      {isMoreDrawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/40 flex items-end"
          onClick={() => setIsMoreDrawerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More study tools and settings"
            className="w-full max-h-[82vh] bg-[var(--background-card)] rounded-t-2xl border-t border-[var(--border-color)] p-4 overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Tools &amp; Settings
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Focus timer, routines, calm audio, appearance &amp; family zone
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreDrawerOpen(false)}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--background-main)]"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {SECONDARY_TOOLS.map((tool) => {
                const Icon = tool.icon;
                const isActive = currentView === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => handleNavClick(tool.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-[#EAF6F0] border-[#0F766E] text-[#0F766E]'
                        : 'bg-[var(--background-main)] border-[var(--border-color)] text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon size={16} className="text-[#0F766E] shrink-0" />
                    <span className="truncate">{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
