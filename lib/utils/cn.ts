import clsx, { type ClassValue } from 'clsx';

/** Join conditional class names. Thin wrapper so `clsx` is imported in one place. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
