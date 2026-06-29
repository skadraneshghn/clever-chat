/* Auth pages are standalone — no sidebar or chat header */

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
