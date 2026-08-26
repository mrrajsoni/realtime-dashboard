import AuthProvider from '@/Providers/AuthProvider';

export default function ProtectedLayout({children}: LayoutProps<'/'>) {
  return <AuthProvider>{children}</AuthProvider>;
}
