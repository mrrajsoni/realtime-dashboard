'use client';
import {authManager} from '@/Auth/AuthManager';
import {refreshAccessToken} from '@/Auth/refreshAccessToken';
import {AuthContext} from '@/Context/AuthContext';
import {TAuthenticationStatus} from '@/types.definitions';
import {useRouter} from 'next/navigation';
import {ReactNode, useEffect, useState} from 'react';

const AuthProvider = ({children}: {children: ReactNode}) => {
  const [authenticationStatus, setAuthenticationStatus] =
    useState<TAuthenticationStatus>('checking');

  const router = useRouter();

  const handleOnLogin = (accessToken: string) => {
    authManager.setAccessToken(accessToken);
    setAuthenticationStatus('authenticated');
  };

  useEffect(() => {
    if (authenticationStatus === 'checking') {
      refreshAccessToken()
        .then(() => {
          setAuthenticationStatus('authenticated');
        })
        .catch(() => {
          setAuthenticationStatus('unauthenticated');
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsubscribe = authManager.subscribe('authProvider', () => {
      setAuthenticationStatus('unauthenticated');
      router.push('/login');
    });

    return () => unsubscribe();
  }, [router]);

  return (
    <AuthContext
      value={{
        authenticationStatus,
        onLogin: handleOnLogin,
      }}
    >
      {children}
    </AuthContext>
  );
};

export default AuthProvider;
