import { Link, Route, Routes } from 'react-router-dom';
import { Card } from './common/Card.tsx';
import Cs2List from './cs2/MatchList.tsx';
import Cs2View from './cs2/MatchView.tsx';
import Cs2Edit from './cs2/MatchEdit.tsx';
import Cs2Stats from './cs2/Stats.tsx';
import CrashList from './crash/MatchList.tsx';
import CrashView from './crash/MatchView.tsx';
import CrashEdit from './crash/MatchEdit.tsx';
import CrashStats from './crash/Stats.tsx';

function Games() {
  return (
    <div className="page">
      <Card title="battle-stats">
        <ul>
          <li>
            <Link to="/cs2">CS2 单挑</Link>
          </li>
          <li>
            <Link to="/crash">Crash</Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Games />} />
      <Route path="/cs2" element={<Cs2List />} />
      <Route path="/cs2/new" element={<Cs2Edit />} />
      <Route path="/cs2/stats" element={<Cs2Stats />} />
      <Route path="/cs2/:id" element={<Cs2View />} />
      <Route path="/cs2/:id/edit" element={<Cs2Edit />} />
      <Route path="/crash" element={<CrashList />} />
      <Route path="/crash/new" element={<CrashEdit />} />
      <Route path="/crash/stats" element={<CrashStats />} />
      <Route path="/crash/:id" element={<CrashView />} />
      <Route path="/crash/:id/edit" element={<CrashEdit />} />
    </Routes>
  );
}
