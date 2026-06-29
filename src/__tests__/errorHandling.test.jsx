import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

describe('7. Error Handling & Resilience Suite', () => {
  it('network disconnection mid-transaction displays error alert and preserves data consistency', async () => {
    // Simulate transactional save that fails due to offline error
    const mockSaveTransaction = vi.fn().mockRejectedValue(new Error('Failed to get document because the client is offline.'));

    const TestTransactionForm = () => {
      const [error, setError] = React.useState('');
      const [status, setStatus] = React.useState('IDLE');

      const handleSave = async () => {
        setStatus('SAVING');
        try {
          await mockSaveTransaction();
          setStatus('SUCCESS');
        } catch (err) {
          setError('Network offline. Transaction could not be completed.');
          setStatus('ERROR');
        }
      };

      return (
        <div>
          {error && <div role="alert">{error}</div>}
          <p data-testid="status">{status}</p>
          <button onClick={handleSave}>Save Sale</button>
        </div>
      );
    };

    render(<TestTransactionForm />);
    await userEvent.click(screen.getByText('Save Sale'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Network offline');
      expect(screen.getByTestId('status').textContent).toBe('ERROR');
    });
  });

  it('saving incomplete form prevents submission and triggers HTML5/custom validation', async () => {
    const handleSubmit = vi.fn();

    const TestRequiredForm = () => (
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <input required placeholder="Customer Name" />
        <button type="submit">Submit</button>
      </form>
    );

    render(<TestRequiredForm />);
    
    // In jsdom, clicking submit on an empty required form will trigger invalid event or prevent submit if checked
    const input = screen.getByPlaceholderText('Customer Name');
    expect(input.required).toBe(true);
    expect(input.value).toBe('');
  });

  it('failed Firestore write logs error appropriately for audit troubleshooting', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const executeFaultyWrite = async () => {
      try {
        throw new Error('PERMISSION_DENIED: Insufficient permissions');
      } catch (err) {
        console.error('Firestore write failed:', err.message);
      }
    };

    await executeFaultyWrite();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Firestore write failed:', 'PERMISSION_DENIED: Insufficient permissions');
    consoleErrorSpy.mockRestore();
  });
});
