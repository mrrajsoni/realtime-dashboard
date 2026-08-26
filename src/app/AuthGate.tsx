'use client';
import {useAuth} from '@/hooks/useAuth';
import {useRouter} from 'next/navigation';
import {ReactNode, useEffect} from 'react';

const AuthGate = ({children}: {children: ReactNode}) => {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.authenticationStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [auth.authenticationStatus, router]);

  if (auth.authenticationStatus === 'unauthenticated' || auth.authenticationStatus === 'checking') {
    return null;
  }

  return children;
};

export default AuthGate;
