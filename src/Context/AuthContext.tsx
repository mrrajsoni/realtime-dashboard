'use client';
import {TAuthenticationStatus} from '@/lib/types.definitions';
import {createContext} from 'react';

interface IAuthContext {
  authenticationStatus: TAuthenticationStatus;
  onLogin: (accessToken: string) => void;
  onLogout: () => Promise<{message: string}>;
}
export const AuthContext = createContext<IAuthContext | null>(null);
