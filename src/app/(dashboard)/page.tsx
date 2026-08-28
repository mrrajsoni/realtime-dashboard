import AuthGate from '../AuthGate';
import LogoutButton from '../components/LogoutButton';
import Metrics from '../components/Metrics';

export default function ProtectedRoutes() {
  return (
    <main>
      <AuthGate>
        <header className="mb-4 flex items-center justify-end">
          <LogoutButton />
        </header>
        <Metrics />
      </AuthGate>
    </main>
  );
}
