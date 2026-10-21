import React, { FC, SVGProps } from 'react';
import { Trophy } from 'lucide-react';

export const TrophyIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <Trophy className="h-6 w-6" color="currentColor" strokeWidth={2} {...props} />
);
