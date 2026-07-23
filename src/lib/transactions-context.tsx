import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { db } from './db';
import type { NewTxn, Txn } from './transactions';
import {
  deleteTransaction,
  getTransaction,
  insertTransaction,
  listTransactions,
  updateTransaction,
} from './transactions';
import { listUserCategories, type UserCategory } from './user-categories';

interface TransactionsContextValue {
  transactions: Txn[];
  ready: boolean;
  add: (input: NewTxn) => number;
  update: (id: number, input: NewTxn) => void;
  remove: (id: number) => void;
  getById: (id: number) => Txn | undefined;
  refresh: () => void;
  userCategories: UserCategory[];
  refreshUserCategories: () => void;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [ready, setReady] = useState(false);
  const [userCategories, setUserCategories] = useState<UserCategory[]>(() => listUserCategories());

  const refresh = useCallback(() => {
    setTransactions(listTransactions(db));
  }, []);

  const refreshUserCategories = useCallback(() => {
    setUserCategories(listUserCategories());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
  }, [refresh]);

  const add = useCallback(
    (input: NewTxn) => {
      const id = insertTransaction(input, db);
      refresh();
      return id;
    },
    [refresh]
  );

  const update = useCallback(
    (id: number, input: NewTxn) => {
      updateTransaction(id, input, db);
      refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    (id: number) => {
      deleteTransaction(id, db);
      refresh();
    },
    [refresh]
  );

  const getById = useCallback(
    (id: number) => transactions.find((t) => t.id === id) ?? getTransaction(id, db) ?? undefined,
    [transactions]
  );

  const value = useMemo<TransactionsContextValue>(
    () => ({ transactions, ready, add, update, remove, getById, refresh, userCategories, refreshUserCategories }),
    [transactions, ready, add, update, remove, getById, refresh, userCategories, refreshUserCategories]
  );

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
}

export function useTransactions(): TransactionsContextValue {
  const ctx = useContext(TransactionsContext);
  if (!ctx) throw new Error('useTransactions must be used within a TransactionsProvider');
  return ctx;
}
