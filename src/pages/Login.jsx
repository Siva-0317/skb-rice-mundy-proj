import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn } from '../firebase/auth';
import { useToast } from '../context/ToastContext';
import { AuthContext } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, loading: authLoading } = useContext(AuthContext);

  useEffect(() => {
    if (user && !authLoading) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err) {
      let msg = 'Invalid email or password';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed attempts. Please try again later.';
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
      showToast(msg, 'error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Centered Watermark Background */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center p-8"
        style={{
          backgroundImage: 'url(/logo.jpeg)',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          opacity: 0.12
        }}
      />

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-border w-full max-w-md relative z-10 text-black">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-black mb-1">
            SKB Rice <span className="text-gold">·</span> Mundy
          </h1>
          <p className="text-textMuted text-sm">Please sign in to your account</p>
        </div>

        {error && (
          <div className="bg-debit/10 text-debit p-3 rounded-lg text-sm mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-textDark mb-1.5" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 bg-bg/50"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-textDark mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 bg-bg/50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-white font-medium py-2.5 rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-70"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
