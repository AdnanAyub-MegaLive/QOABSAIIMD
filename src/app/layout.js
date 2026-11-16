import "./globals.css";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/geist";
import "./portal-ui.css";
import "./portal-ops.css";
import PortalMotion from "./components/portal-motion";
import PortalAutoRefresh from "./components/portal-auto-refresh";
import PortalAccessProvider from "./components/portal-access";
import PortalIdleSession from "./components/portal-idle-session";

export const metadata = {
  title: "Mega Live Portal | Administration",
  description: "Secure administration portal for Mega Live Portal.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><PortalAccessProvider><PortalMotion>{children}</PortalMotion><PortalAutoRefresh /><PortalIdleSession /></PortalAccessProvider></body>
    </html>
  );
}
