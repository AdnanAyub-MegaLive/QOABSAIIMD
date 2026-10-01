import "./globals.css";
import PortalAutoRefresh from "./components/portal-auto-refresh";
import PortalAccessProvider from "./components/portal-access";

export const metadata = {
  title: "Admin Sign In | Mega Live Portal",
  description: "Secure administration portal for Mega Live Portal.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><PortalAccessProvider>{children}<PortalAutoRefresh /></PortalAccessProvider></body>
    </html>
  );
}
