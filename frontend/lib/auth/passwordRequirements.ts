export type PasswordRequirementKey =
  | 'minLength'
  | 'uppercase'
  | 'number'
  | 'symbol';

export type PasswordRequirement = {
  key: PasswordRequirementKey;
  label: string;
  test: (password: string) => boolean;
};

/** Matches signup checklist in Header / account password flows. */
export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { key: 'minLength', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { key: 'number', label: 'One number', test: (p) => /\d/.test(p) },
  {
    key: 'symbol',
    label: 'One special character',
    test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(p),
  },
];

export function evaluatePasswordRequirements(
  password: string,
  requirements: PasswordRequirement[] = PASSWORD_REQUIREMENTS
): Record<PasswordRequirementKey, boolean> {
  const out = {} as Record<PasswordRequirementKey, boolean>;
  for (const req of requirements) {
    out[req.key] = req.test(password);
  }
  return out;
}

export function passwordMeetsMinimumRequirements(
  password: string,
  requirements: PasswordRequirement[] = PASSWORD_REQUIREMENTS
): boolean {
  return requirements.every((req) => req.test(password));
}
