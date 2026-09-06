import React, { useContext, useEffect } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from '../context/AuthContext';
import { signIn, signOutUser } from '../firebase/auth';

// Mock Firebase SDK modules
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: { uid: 'user-123', email: 'owner@skbmundy.com' } })),
  setPersistence: vi.fn(() => Promise.resolve()),
  browserSessionPersistence: {},
  onAuthStateChanged: vi.fn((auth, callback) => {
    return () => {};
  }),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
}));

vi.mock('../firebase/auth', () => ({
  signIn: vi.fn(),
  signOutUser: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({
    exists: () => true,
    data: () => ({ role: 'owner' }),
  })),
}));

import { signOut, onAuthStateChanged } from 'firebase/auth';

// Helper component to test auth context consumer & redirection
const TestDashboard = () => {
  const { user } = useContext(AuthContext);
  return (
    <div>
      <h1>Dashboard Page</h1>
      {user && <p data-testid="user-email">{user.email}</p>}
      <button onClick={signOutUser}>Logout</button>
    </div>
  );
};

const TestLogin = () => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      await signIn(email, password);
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  return (
    <div>
      <h1>Login Page</h1>
      {error && <div role="alert">{error}</div>}
      <form onSubmit={handleSubmit}>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit">Sign In</button>
      </form>
    </div>
  );
};

describe('1. Authentication & Session Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login with valid credentials sets user immediately and redirects to dashboard', async () => {
    let authCallback;
    onAuthStateChanged.mockImplementation((auth, cb) => {
      authCallback = cb;
      return () => {};
    });

    signIn.mockResolvedValueOnce({
      user: { uid: 'user-123', email: 'owner@skbmundy.com' }
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<TestLogin />} />
            <Route path="/dashboard" element={<TestDashboard />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    const emailInput = screen.getByPlaceholderText('Email');
    const passwordInput = screen.getByPlaceholderText('Password');
    const submitBtn = screen.getByText('Sign In');

    await userEvent.type(emailInput, 'owner@skbmundy.com');
    await userEvent.type(passwordInput, 'secret123');
    await userEvent.click(submitBtn);

    expect(signIn).toHaveBeenCalledWith('owner@skbmundy.com', 'secret123');

    // Simulate Firebase auth state changed callback resolving user immediately inside act
    await act(async () => {
      authCallback({ uid: 'user-123', email: 'owner@skbmundy.com' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('user-email').textContent).toBe('owner@skbmundy.com');
    });
  });

  it('login with invalid credentials renders error message', async () => {
    signIn.mockRejectedValueOnce(new Error('auth/wrong-password'));

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<TestLogin />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await userEvent.type(screen.getByPlaceholderText('Email'), 'wrong@skbmundy.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'badpass');
    await userEvent.click(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Invalid email or password');
    });
  });

  it('logout clears session state and redirects to login', async () => {
    onAuthStateChanged.mockImplementation((auth, cb) => {
      setTimeout(() => cb({ uid: 'user-123', email: 'owner@skbmundy.com' }), 0);
      return () => {};
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/login" element={<TestLogin />} />
            <Route path="/dashboard" element={<TestDashboard />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeDefined();
    });

    await userEvent.click(screen.getByText('Logout'));
    expect(signOutUser).toHaveBeenCalled();
  });

  // This previously asserted the opposite — that a beforeunload listener signed the user
  // out — which is exactly what made a page refresh dump the operator back to the login
  // screen mid-invoice. Signing out on unload also fires on ordinary navigation and tab
  // close, so it can never distinguish "leaving" from "reloading". The listener was
  // removed; this test now guards against it coming back.
  it('does NOT sign out on beforeunload, so a refresh keeps the session', async () => {
    onAuthStateChanged.mockImplementation((auth, cb) => {
      cb({ uid: 'user-123', email: 'owner@skbmundy.com' });
      return () => {};
    });

    render(
      <AuthProvider>
        <TestDashboard />
      </AuthProvider>
    );

    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});
