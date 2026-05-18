

## Plan: Fix Login Flow & Test End-to-End

### Problem
The login flow has two issues preventing the dashboard from loading after OTP verification:

1. **`AuthProvider` is not used in `App.tsx`** — The `AuthContext` exists but is never wrapped around the app routes, so `useAuth()` and `ProtectedRoute` don't function.
2. **`ProtectedRoute` is not wrapping dashboard routes** — Dashboard pages (`/dashboard`, `/exam/booking`, `/exam/reservations`) are unprotected and rely on manual `getSession()` checks instead of the centralized auth context.
3. **OTP page doesn't call `login()` from AuthContext** — After successful OTP verification, it navigates to dashboard but doesn't update the auth state in context.

### Changes

#### 1. Wrap App with AuthProvider
In `src/App.tsx`, import and wrap all routes with `<AuthProvider>`.

#### 2. Protect dashboard routes
Wrap `/dashboard`, `/exam/booking`, and `/exam/reservations` with `<ProtectedRoute>`.

#### 3. Update OTP page to use AuthContext
After successful OTP verify, call `login(accessToken)` from `useAuth()` to update the auth state.

#### 4. Update Login page token login
Similarly call `login(accessToken)` after successful token login.

### Technical Details

**Files to modify:**
- `src/App.tsx` — Add `AuthProvider` wrapper, wrap protected routes with `ProtectedRoute`
- `src/pages/auth/OtpPage.tsx` — Import `useAuth`, call `login()` after successful verification
- `src/pages/auth/LoginPage.tsx` — Import `useAuth`, call `login()` after token login

The `apiAuth` function already saves tokens to `localStorage`, so the dashboard's `getSession()` check will work. Adding `AuthContext` integration ensures consistent auth state across the app.

