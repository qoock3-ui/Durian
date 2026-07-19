import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Assets from "./pages/Assets";
import Incomes from "./pages/Incomes";
import Expenses from "./pages/Expenses";
import Trends from "./pages/Trends";
import { useStore } from "./store";
import { getToken } from "./api";

export default function App() {
  const { user, loading } = useStore();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">載入中…</div>;
  }
  if (!user && !getToken()) {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/incomes" element={<Incomes />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
