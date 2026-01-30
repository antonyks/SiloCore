import React, { type ReactNode } from 'react';

type CardRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';

interface CardProps {
  children: ReactNode;
  className?: string;
  radius?: CardRadius;
}

const RADIUS_MAP: Record<CardRadius, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
  full: 'rounded-full',
};

export const Card: React.FC<CardProps> = ({ children, className = '', radius='lg' }) => {

  const roundedClass = RADIUS_MAP[radius] || RADIUS_MAP.lg;
   
  return (
    <div className={`bg-white shadow p-6 ${className} ${roundedClass}`}>
      {children}
    </div>
  );
};