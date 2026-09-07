import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Editing an item from Item Masters was broken outright, and had been since the
// modal was written. handleSubmit called
//
//   updateItem(id, { categoryKey, bagKg, mrp })
//
// with no `name`. updateItem treats a missing name as blank and throws
// "Item name is required.", so the save failed EVERY time — a plain MRP or
// category correction included, not just a rename. The Item Name field was
// disabled at the time, which is why nobody read it as a missing field: it
// looked deliberately read-only rather than silently unsent.
//
// itemRename.test.js exercises updateItem directly, so it passed throughout and
// caught none of this. These tests go through the modal, which is where the
// defect lived: they assert on the payload the form actually sends.

const updateItemMock = vi.fn();
const addItemMock = vi.fn();
const showToastMock = vi.fn();

vi.mock('../firebase/items', () => ({
  updateItem: (...a) => updateItemMock(...a),
  addItem: (...a) => addItemMock(...a),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock('../components/AddCategoryModal', () => ({ default: () => null }));

import AddItemModal from '../components/AddItemModal';
import { AuthContext } from '../context/AuthContext';

const CATEGORIES = [
  { key: 'carshed', label: 'Carshed' },
  { key: 'boiled', label: 'Boiled Rice' },
];

const ITEM = {
  id: 'item-carshed',
  name: 'Hmt Boiled ',
  categoryKey: 'carshed',
  bagKg: 26,
  mrp: 1550,
  stock: 774,
  active: true,
};

// getByDisplayValue normalises whitespace, so it cannot match the trailing space
// on "Hmt Boiled " — and that trailing space is precisely what makes this record
// hard to tell apart in the UI. Query by position instead, and read `disabled`
// off the node rather than through jest-dom, which this project does not install.
const fields = () => {
  const inputs = [...document.querySelectorAll('input')];
  return { name: inputs[0], bagKg: inputs[1], mrp: inputs[2], stock: inputs[3] };
};

const renderEditing = (item = ITEM) =>
  render(
    <AuthContext.Provider value={{ user: { email: 'owner@example.com' }, role: 'owner' }}>
      <AddItemModal
        isOpen
        onClose={() => {}}
        onSuccess={() => {}}
        editingItem={item}
        categories={CATEGORIES}
      />
    </AuthContext.Provider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  updateItemMock.mockResolvedValue(undefined);
});

describe('editing an item through the modal', () => {
  it('sends the name, so a plain MRP edit does not fail', async () => {
    const user = userEvent.setup();
    renderEditing();

    const mrp = fields().mrp;
    await user.clear(mrp);
    await user.type(mrp, '1600');
    await user.click(screen.getByRole('button', { name: /save item/i }));

    await waitFor(() => expect(updateItemMock).toHaveBeenCalledTimes(1));
    const [id, payload] = updateItemMock.mock.calls[0];
    expect(id).toBe('item-carshed');
    // The whole bug in one assertion.
    expect(payload).toHaveProperty('name');
    expect(payload.name).toBe('Hmt Boiled ');
    expect(payload.mrp).toBe(1600);
  });

  it('sends the new name when the item is renamed', async () => {
    const user = userEvent.setup();
    renderEditing();

    const nameField = fields().name;
    await user.clear(nameField);
    await user.type(nameField, 'HMT Boiled - Carshed');
    await user.click(screen.getByRole('button', { name: /save item/i }));

    await waitFor(() => expect(updateItemMock).toHaveBeenCalledTimes(1));
    expect(updateItemMock.mock.calls[0][1].name).toBe('HMT Boiled - Carshed');
  });

  it('leaves the Item Name field editable while editing', () => {
    renderEditing();
    expect(fields().name.value).toBe('Hmt Boiled ');
    expect(fields().name.disabled).toBe(false);
  });

  it('keeps Opening Stock locked, so stock still moves only through Adjust Stock', () => {
    renderEditing();
    expect(fields().stock.value).toBe('774');
    expect(fields().stock.disabled).toBe(true);
  });

  it('never sends a stock figure on edit', async () => {
    const user = userEvent.setup();
    renderEditing();
    await user.click(screen.getByRole('button', { name: /save item/i }));

    await waitFor(() => expect(updateItemMock).toHaveBeenCalledTimes(1));
    expect(updateItemMock.mock.calls[0][1]).not.toHaveProperty('stock');
  });

  it('surfaces the real reason a save was refused, not a generic failure', async () => {
    const user = userEvent.setup();
    updateItemMock.mockRejectedValue(
      new Error('An item with the name "HMT Boiled" already exists.')
    );
    renderEditing();
    await user.click(screen.getByRole('button', { name: /save item/i }));

    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
    const [msg, kind] = showToastMock.mock.calls.at(-1);
    // "Failed to save item" told the operator nothing they could act on.
    expect(msg).toMatch(/already exists/i);
    expect(kind).toBe('error');
  });
});
