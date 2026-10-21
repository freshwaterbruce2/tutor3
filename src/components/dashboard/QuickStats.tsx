import { AlertCircle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import type { HomeworkItem } from '../../types';

interface QuickStatsProps {
  items: HomeworkItem[];
}

const QuickStats = ({ items }: QuickStatsProps) => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const completedToday = items.filter((i) => {
    if (!i.completed || !i.completedDate) return false;
    const completedDate = new Date(i.completedDate);
    return completedDate.toDateString() === now.toDateString();
  }).length;

  const overdue = items.filter((i) => {
    if (i.completed) return false;
    const dueDate = new Date(i.dueDate);
    return dueDate.getTime() < today.getTime();
  }).length;

  const dueToday = items.filter((i) => {
    if (i.completed) return false;
    const dueDate = new Date(i.dueDate);
    return dueDate.toDateString() === today.toDateString();
  }).length;

  const completionRate =
    items.length > 0
      ? Math.round((items.filter((i) => i.completed).length / items.length) * 100)
      : 0;

  const stats = [
    {
      icon: CheckCircle2,
      label: 'Completed Today',
      value: completedToday,
      color: 'text-emerald-700',
      iconBg: 'bg-emerald-50 text-emerald-700',
    },
    {
      icon: Clock,
      label: 'Due Today',
      value: dueToday,
      color: 'text-amber-700',
      iconBg: 'bg-amber-50 text-amber-700',
    },
    {
      icon: AlertCircle,
      label: 'Overdue',
      value: overdue,
      color: overdue > 0 ? 'text-red-700' : 'text-[var(--text-primary)]',
      iconBg: overdue > 0 ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-600',
    },
    {
      icon: TrendingUp,
      label: 'Completion Rate',
      value: `${completionRate}%`,
      color: 'text-teal-700',
      iconBg: 'bg-teal-50 text-teal-700',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[var(--background-main)] border border-[var(--border-subtle)]"
        >
          <div className={`p-2.5 rounded-xl shrink-0 ${stat.iconBg}`}>
            <stat.icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[var(--text-secondary)] truncate">
              {stat.label}
            </p>
            <p className={`text-xl font-extrabold font-mono tabular-nums ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default QuickStats;
