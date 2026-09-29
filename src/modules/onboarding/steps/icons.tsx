import React from 'react';
import { BookOpen, Briefcase, Code2, GraduationCap, Heart, Lightbulb, Rocket, Sparkles, Target, Trophy, Users, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The icons a motivation answer may use, by the names the admin picks from
 * (`ONBOARDING_ICONS` in src/platform/settings/meta.ts). An unknown name
 * draws nothing rather than failing.
 */
const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  'graduation-cap': GraduationCap,
  target: Target,
  sparkles: Sparkles,
  rocket: Rocket,
  'book-open': BookOpen,
  code: Code2,
  heart: Heart,
  trophy: Trophy,
  lightbulb: Lightbulb,
  users: Users,
  zap: Zap
};

export const OptionIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 16 }) => {
  const Icon = Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : null;
  return Icon ? <Icon size={size} className="text-accent shrink-0" aria-hidden="true" /> : null;
};
