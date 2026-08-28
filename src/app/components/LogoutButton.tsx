'use client';

import {useAuth} from '@/hooks/useAuth';
import {toast} from 'sonner';

const LogoutButton = () => {
  const auth = useAuth();
  const onLogout = () => {
    auth.onLogout().then((value) => {
      toast.success(value.message);
    });
  };
  return (
    <button
      type="button"
      onClick={onLogout}
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
    >
      Log out
    </button>
  );
};

export default LogoutButton;
