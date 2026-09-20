import React from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-line';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square button holding only an icon. */
  icon?: boolean;
  block?: boolean;
  className?: string;
}

export type ButtonProps = BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>;

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  'danger-line': 'btn-danger-line'
};

const SIZE: Record<ButtonSize, string> = { sm: 'btn-sm', md: '', lg: 'btn-lg' };

export function buttonClass({ variant = 'secondary', size = 'md', icon, block, className = '' }: BaseProps): string {
  return ['btn', VARIANT[variant], SIZE[size], icon ? 'btn-icon' : '', block ? 'btn-block' : '', className]
    .filter(Boolean)
    .join(' ');
}

/** The one button. Every clickable action in the product goes through here or `buttonClass`. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, icon, block, className, type = 'button', ...rest }, ref) => (
    <button ref={ref} type={type} className={buttonClass({ variant, size, icon, block, className })} {...rest} />
  )
);
Button.displayName = 'Button';

/** A router link dressed as a button, for navigation that reads as an action. */
export const ButtonLink: React.FC<BaseProps & LinkProps> = ({ variant, size, icon, block, className, ...rest }) => (
  <Link className={buttonClass({ variant, size, icon, block, className })} {...rest} />
);
