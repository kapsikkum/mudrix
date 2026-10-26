export interface PasswordValidity {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

export function checkPassword(p: string): PasswordValidity {
  return {
    length: p.length >= 8,
    uppercase: /[A-Z]/.test(p),
    lowercase: /[a-z]/.test(p),
    number: /[0-9]/.test(p),
    special: /[^A-Za-z0-9]/.test(p),
  };
}

export function isPasswordValid(validity: PasswordValidity): boolean {
  return (
    validity.length &&
    validity.uppercase &&
    validity.lowercase &&
    validity.number &&
    validity.special
  );
}

export type PasswordStrength = 'weak' | 'okay' | 'strong';

export function passwordStrength(p: string): PasswordStrength {
  const v = checkPassword(p);
  const variety = [v.uppercase, v.lowercase, v.number, v.special].filter(Boolean).length;
  if (p.length < 8 || variety < 2) return 'weak';
  if (p.length >= 14 || (p.length >= 10 && variety >= 3) || variety === 4) return 'strong';
  return 'okay';
}
