import React, { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useFocusTrap } from '@/ui/hooks/useFocusTrap';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PERKS = [
  ['Stages 09 and 10', 'System design and shipping to production — 40 more challenges.'],
  ['Reference solutions', 'Every coding challenge comes with a worked answer.'],
  ['Streak shield', 'One missed day a month does not break your streak.'],
  ['Leaderboard badge', 'Pro members are marked on the board.']
];

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose }) => {
  const { stats, upgradeToPro } = useSession();
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const upgrade = async () => {
    setLoading(true);
    try {
      await upgradeToPro();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-card pro-card"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="CodeConsist Pro"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <div className="modal-stage-badge">Membership</div>
            <h3 className="modal-title">CodeConsist Pro</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="pro-price">
            <span className="pro-amount">$12</span>
            <span className="pro-period">per month</span>
          </div>

          <ul className="pro-perks">
            {PERKS.map(([title, detail]) => (
              <li key={title}>
                <span className="pro-check" aria-hidden="true">
                  <Check size={14} strokeWidth={2.5} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Saying this plainly beats a fake Stripe button that silently flips
              a local flag and calls itself a purchase. */}
          <div className="notice notice-info">
            This build has no payment processor connected. Unlocking Pro here just sets the flag on
            your local account so you can try the premium stages.
          </div>

          <button
            type="button"
            className="btn btn-solid btn-lg pro-cta"
            disabled={loading || stats.isPremium}
            onClick={upgrade}
          >
            {stats.isPremium ? 'Pro is active' : loading ? 'Unlocking…' : 'Unlock Pro stages'}
          </button>
        </div>
      </div>
    </div>
  );
};
