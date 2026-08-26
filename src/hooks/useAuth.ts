'use client';

import {AuthContext} from '@/Context/AuthContext';
import {use} from 'react';

export const useAuth = () => {
  const authContext = use(AuthContext);
  if (!authContext) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return authContext;
};
