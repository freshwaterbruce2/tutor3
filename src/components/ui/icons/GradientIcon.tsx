import { LucideIcon } from 'lucide-react';
import { FC } from 'react';

interface GradientIconProps {
  Icon: LucideIcon;
  size?: number;
  className?: string;
  gradientId?: string;
}

// Friendly Studio Gradient definitions (Sage Teal, Warm Coral, Sky Blue, Honey Amber)
export const GradientDefs: FC = () => (
  <svg width="0" height="0" className="gradient-defs-svg" aria-hidden="true">
    <defs>
      {/* Primary gradient: Friendly Sage Teal to Meadow Emerald */}
      <linearGradient id="vibe-gradient-primary" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0D9488" />
        <stop offset="55%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>

      {/* Secondary gradient: Cheerful Coral to Warm Amber */}
      <linearGradient id="vibe-gradient-secondary" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F97316" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>

      {/* Accent gradient: Clear Sky Blue to Teal */}
      <linearGradient id="vibe-gradient-accent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0284C7" />
        <stop offset="100%" stopColor="#0D9488" />
      </linearGradient>

      {/* Radial glow gradient */}
      <radialGradient id="vibe-gradient-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#10B981" stopOpacity="0.75" />
        <stop offset="50%" stopColor="#0D9488" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#0284C7" stopOpacity="0.1" />
      </radialGradient>

      {/* High contrast / active button icon gradient */}
      <linearGradient id="vibe-gradient-mobile" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#F0FDFA" />
      </linearGradient>
    </defs>
  </svg>
);

export const GradientIcon: FC<GradientIconProps> = ({
  Icon,
  size = 24,
  className = '',
  gradientId = 'vibe-gradient-primary',
}) => {
  const minSize = size < 40 ? 40 : size;
  const iconSize = size;

  return (
    <div
      className={`inline-flex items-center justify-center gradient-icon-touch-target ${className}`}
      style={{ '--icon-min': `${minSize}px` } as React.CSSProperties}
    >
      <Icon
        size={iconSize}
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        fill="none"
        className="gradient-icon-glow transition-transform duration-150"
      />
    </div>
  );
};

export const GradientIconSolid: FC<GradientIconProps> = ({
  Icon,
  size = 24,
  className = '',
  gradientId = 'vibe-gradient-primary',
}) => {
  const minSize = size < 40 ? 40 : size;
  const iconSize = size;

  return (
    <div
      className={`inline-flex items-center justify-center gradient-icon-touch-target ${className}`}
      style={{ '--icon-min': `${minSize}px` } as React.CSSProperties}
    >
      <Icon
        size={iconSize}
        fill={`url(#${gradientId})`}
        stroke="none"
        className="gradient-icon-glow-solid transition-transform duration-150"
      />
    </div>
  );
};

export const MobileGradientIcon: FC<GradientIconProps> = ({
  Icon,
  size = 26,
  className = '',
  gradientId = 'vibe-gradient-primary',
}) => {
  return (
    <div
      className={`inline-flex items-center justify-center p-2 rounded-xl transition-all gradient-icon-touch-target ${className}`}
      style={{ '--icon-min': '44px' } as React.CSSProperties}
    >
      <Icon
        size={size}
        stroke={`url(#${gradientId})`}
        strokeWidth={2.25}
        fill="none"
        className="gradient-icon-glow-mobile transition-transform active:scale-95"
      />
    </div>
  );
};
