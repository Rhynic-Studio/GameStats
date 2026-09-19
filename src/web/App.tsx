import { Navigate, Route, Routes } from 'react-router-dom';
import GamePicker from './pages/GamePicker.tsx';
import GameLayout from './GameLayout.tsx';
import GameHome from './pages/GameHome.tsx';
import NewSeries from './pages/NewSeries.tsx';
import Entry from './pages/Entry.tsx';
import History from './pages/History.tsx';
import Stats from './pages/Stats.tsx';
import DataPage from './pages/DataPage.tsx';
import Rules from './pages/Rules.tsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GamePicker />} />
      <Route path="/:game" element={<GameLayout />}>
        <Route index element={<GameHome />} />
        <Route path="new" element={<NewSeries />} />
        <Route path="s/:id" element={<Entry />} />
        <Route path="history" element={<History />} />
        <Route path="stats" element={<Stats />} />
        <Route path="rules" element={<Rules />} />
        <Route path="data" element={<DataPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
