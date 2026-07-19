import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { get, getToken, setToken } from "./api";
import type { Asset, Expense, Income, Rates, User } from "./lib/constants";

type Store = {
  user: User | null;
  assets: Asset[];
  incomes: Income[];
  expenses: Expense[];
  rates: Rates;
  loading: boolean;
  refresh: (table?: "assets" | "incomes" | "expenses") => Promise<void>;
  login: (user: User, token: string) => void;
  logout: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rates, setRates] = useState<Rates>({ rates: { TWD: 1 }, updated_at: null });
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async (table?: "assets" | "incomes" | "expenses") => {
    if (!table || table === "assets") setAssets(await get<Asset[]>("/api/assets"));
    if (!table || table === "incomes") setIncomes(await get<Income[]>("/api/incomes"));
    if (!table || table === "expenses") setExpenses(await get<Expense[]>("/api/expenses"));
    if (!table) setRates(await get<Rates>("/api/rates"));
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    (async () => {
      try {
        const me = await get<User>("/api/me");
        setUser(me);
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const login = useCallback(
    (u: User, token: string) => {
      setToken(token);
      setUser(u);
      setLoading(true);
      refresh().finally(() => setLoading(false));
    },
    [refresh],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setAssets([]);
    setIncomes([]);
    setExpenses([]);
  }, []);

  return (
    <StoreContext.Provider value={{ user, assets, incomes, expenses, rates, loading, refresh, login, logout }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used within StoreProvider");
  return store;
}
