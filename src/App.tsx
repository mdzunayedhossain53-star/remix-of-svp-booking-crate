import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AccessAuthProvider } from "@/contexts/AccessAuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AccessProtectedRoute from "@/components/AccessProtectedRoute";
import LoginPage from "@/pages/auth/LoginPage";
import OtpPage from "@/pages/auth/OtpPage";
import DashboardPage from "@/pages/DashboardPage";
import BookingPage from "@/pages/exam/BookingPage";
import ReservationsPage from "@/pages/exam/ReservationsPage";
import AccessLoginPage from "@/pages/access/AccessLoginPage";
import ForgotPasswordPage from "@/pages/access/ForgotPasswordPage";
import AccessDashboardPage from "@/pages/access/AccessDashboardPage";
import AccessAccountsPage from "@/pages/access/AccessAccountsPage";
import AccessUsersPage from "@/pages/access/AccessUsersPage";
import AccessAgenciesPage from "@/pages/access/AccessAgenciesPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AccessAuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* SVP Auth */}
              <Route path="/" element={<Navigate to="/access/login" replace />} />
              <Route path="/auth/login" element={<AccessProtectedRoute allowedRoles={["USER"]}><LoginPage /></AccessProtectedRoute>} />
              <Route path="/auth/otp" element={<AccessProtectedRoute allowedRoles={["USER"]}><OtpPage /></AccessProtectedRoute>} />
              <Route path="/user" element={<Navigate to="/auth/login" replace />} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/exam/booking" element={<ProtectedRoute><BookingPage /></ProtectedRoute>} />
              <Route path="/exam/reservations" element={<ProtectedRoute><ReservationsPage /></ProtectedRoute>} />

              {/* Access Control System */}
              <Route path="/access/login" element={<AccessLoginPage />} />
              <Route path="/access/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/access/dashboard" element={<AccessProtectedRoute><AccessDashboardPage /></AccessProtectedRoute>} />
              <Route path="/access/accounts" element={<AccessProtectedRoute allowedRoles={["ADMIN"]}><AccessAccountsPage /></AccessProtectedRoute>} />
              <Route path="/access/users" element={<AccessProtectedRoute allowedRoles={["ADMIN", "AGENCY"]}><AccessUsersPage /></AccessProtectedRoute>} />
              <Route path="/access/agencies" element={<AccessProtectedRoute allowedRoles={["ADMIN"]}><AccessAgenciesPage /></AccessProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AccessAuthProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
