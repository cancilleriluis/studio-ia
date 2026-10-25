import { customAlphabet } from 'nanoid';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

export function uid(prefix = ''): string {
  return prefix + nano();
}
