import { Link, Route, Routes } from 'react-router-dom';
import MatchList from './cs2/MatchList.tsx';
import MatchEdit from './cs2/MatchEdit.tsx';
import Stats from './cs2/Stats.tsx';

function Games() {
  return (
    <div className="page">
      <h1>battle-stats</h1>
      <p>
        <Link to="/cs2">CS2 单挑</Link>
      </p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Games />} />
      <Route path="/cs2" element={<MatchList />} />
      <Route path="/cs2/new" element={<MatchEdit />} />
      <Route path="/cs2/stats" element={<Stats />} />
      <Route path="/cs2/:id" element={<MatchEdit />} />
    </Routes>
  );
}
