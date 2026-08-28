'use client';

import {authManager} from '@/Auth/AuthManager';
import {logoutUser} from '@/Auth/logoutUser';
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

  const handleOnLogout = () => {
    authManager.clearAccessToken();
    // ponytail: the local token is already gone, so a failed server revoke still
    // logs the user out here — it just gets a vaguer message.
    return logoutUser()
      .catch(() => ({message: 'Signed out on this device'}))
      .then((body) => {
        debugger;
        setAuthenticationStatus('unauthenticated');
        setTimeout(() => {
          router.push('/login');
        }, 500);
        return {message: body?.message ?? 'Signed out'};
      });
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
        onLogout: handleOnLogout,
      }}
    >
      {children}
    </AuthContext>
  );
};

export default AuthProvider;
