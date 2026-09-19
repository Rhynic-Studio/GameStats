import { Link, Route, Routes } from 'react-router-dom';
import MatchList from './cs2/MatchList.tsx';
import MatchView from './cs2/MatchView.tsx';
import MatchEdit from './cs2/MatchEdit.tsx';
import Stats from './cs2/Stats.tsx';

function Games() {
  return (
    <div className="page">
      <div className="card">
        <div className="card-head">
          <span className="card-title">battle-stats</span>
        </div>
        <div className="card-body">
          <Link to="/cs2">CS2 单挑</Link>
        </div>
      </div>
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
      <Route path="/cs2/:id" element={<MatchView />} />
      <Route path="/cs2/:id/edit" element={<MatchEdit />} />
    </Routes>
  );
}
