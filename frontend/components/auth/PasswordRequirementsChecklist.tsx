'use client';

import {
  PASSWORD_REQUIREMENTS,
  evaluatePasswordRequirements,
} from '@/lib/auth/passwordRequirements';

type Props = {
  password: string;
  className?: string;
};

export function PasswordRequirementsChecklist({ password, className = '' }: Props) {
  if (password.length === 0) return null;

  const status = evaluatePasswordRequirements(password);

  return (
    <div className={`mt-2 space-y-1 ${className}`} aria-label="Password requirements">
      <div className="text-xs font-medium text-neutral-400 mb-1">Password requirements:</div>
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = status[req.key];
        return (
          <div
            key={req.key}
            className={`text-xs flex items-center gap-1.5 ${met ? 'text-emerald-400' : 'text-red-400'}`}
          >
            <span aria-hidden>{met ? '✓' : '○'}</span>
            <span>{req.label}</span>
          </div>
        );
      })}
    </div>
  );
}
