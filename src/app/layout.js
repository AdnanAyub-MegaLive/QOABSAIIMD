import "./globals.css";
import PortalAutoRefresh from "./components/portal-auto-refresh";

export const metadata = {
  title: "Admin Sign In | Mega Live Portal",
  description: "Secure administration portal for Mega Live Portal.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}<PortalAutoRefresh /></body>
    </html>
  );
}
