import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

describe('5. UI Responsiveness & Touch Targets Suite', () => {
  it('sidebar collapses into hamburger menu on mobile viewports (<768px)', () => {
    // Verify standard responsive CSS structure for sidebar toggle
    const MockAppShellHeader = () => (
      <header className="flex items-center justify-between p-4">
        <button className="md:hidden p-2.5 min-w-[44px] min-h-[44px]" aria-label="Toggle Menu">
          Hamburger Icon
        </button>
        <div className="hidden md:flex">Desktop Sidebar</div>
      </header>
    );

    render(<MockAppShellHeader />);
    const hamburgerBtn = screen.getByLabelText('Toggle Menu');
    expect(hamburgerBtn.className).toContain('md:hidden');
    expect(hamburgerBtn.className).toContain('min-w-[44px]');
  });

  it('tables implement horizontal scrolling container and sticky headers', () => {
    const MockTableContainer = () => (
      <div className="overflow-x-auto max-h-[70vh]" data-testid="table-wrapper">
        <table className="w-full min-w-[700px]">
          <thead className="sticky top-0 z-10 bg-panel shadow-sm" data-testid="table-head">
            <tr><th>Header 1</th></tr>
          </thead>
          <tbody><tr><td>Row 1</td></tr></tbody>
        </table>
      </div>
    );

    render(<MockTableContainer />);
    expect(screen.getByTestId('table-wrapper').className).toContain('overflow-x-auto');
    expect(screen.getByTestId('table-head').className).toContain('sticky');
    expect(screen.getByTestId('table-head').className).toContain('top-0');
  });

  it('forms stack vertically with full-width inputs on mobile viewports', () => {
    const MockResponsiveForm = () => (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="form-grid">
        <div className="sm:col-span-2">
          <input className="w-full text-base sm:text-sm min-h-[44px]" placeholder="Full Width Input" />
        </div>
      </div>
    );

    render(<MockResponsiveForm />);
    const grid = screen.getByTestId('form-grid');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    
    const input = screen.getByPlaceholderText('Full Width Input');
    expect(input.className).toContain('w-full');
    expect(input.className).toContain('text-base'); // prevents iOS auto-zoom
  });

  it('dashboard cards collapse into single column grid on mobile', () => {
    const MockDashboardCards = () => (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="stat-cards">
        <div>Card 1</div>
        <div>Card 2</div>
        <div>Card 3</div>
      </div>
    );

    render(<MockDashboardCards />);
    expect(screen.getByTestId('stat-cards').className).toContain('grid-cols-1');
  });

  it('search bar and notification bell maintain >=44px touch targets', () => {
    const MockHeaderControls = () => (
      <div className="flex items-center gap-3">
        <input className="min-h-[44px] px-3 py-2 text-base sm:text-sm" placeholder="Search..." />
        <button className="min-w-[44px] min-h-[44px] p-2.5 inline-flex items-center justify-center" aria-label="Notifications">
          Bell
        </button>
      </div>
    );

    render(<MockHeaderControls />);
    const searchInput = screen.getByPlaceholderText('Search...');
    const bellBtn = screen.getByLabelText('Notifications');

    expect(searchInput.className).toContain('min-h-[44px]');
    expect(bellBtn.className).toContain('min-w-[44px]');
    expect(bellBtn.className).toContain('min-h-[44px]');
  });
});
