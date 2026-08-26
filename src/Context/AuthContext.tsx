'use client';
import {TAuthenticationStatus} from '@/types.definitions';
import {createContext} from 'react';

interface IAuthContext {
  authenticationStatus: TAuthenticationStatus;
  onLogin: (accessToken: string) => void;
}
export const AuthContext = createContext<IAuthContext | null>(null);
