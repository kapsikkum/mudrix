import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { accountStorageKey } from '@/const/accountStorage';

const accountStringStorage = {
  getItem: (key: string): string | null => localStorage.getItem(accountStorageKey(key)),
  setItem: (key: string, value: string): void => {
    localStorage.setItem(accountStorageKey(key), value);
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(accountStorageKey(key));
  },
};

export function atomWithAccountStorage<Value>(key: string, initialValue: Value) {
  return atomWithStorage<Value>(
    key,
    initialValue,
    createJSONStorage<Value>(() => accountStringStorage)
  );
}
