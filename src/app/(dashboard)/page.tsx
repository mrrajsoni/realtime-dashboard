import AuthGate from '../AuthGate';
import Metrics from '../components/Metrics';

export default function ProtectedRoutes() {
  return (
    <main>
      <AuthGate>
        <Metrics />
      </AuthGate>
    </main>
  );
}
