import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Search } from 'lucide-react';

function ItemSearchSelect({ value, items, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState(null);
  const containerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleReposition = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, []);

  const openMenu = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMenuRect({ top: rect.bottom, left: rect.left, width: rect.width });
    }
    setOpen(true);
    setQuery('');
  };

  const selectedItem = items.find(i => i.id === value);
  const filteredItems = query.trim()
    ? items.filter(i => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  return (
    <div className="relative" ref={containerRef}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted pointer-events-none" />
      <input
        type="text"
        value={open ? query : (selectedItem ? `${selectedItem.name} · ${selectedItem.bagKg}kg` : '')}
        onFocus={openMenu}
        onChange={(e) => { setQuery(e.target.value); if (!open) openMenu(); }}
        disabled={disabled}
        placeholder="Search item..."
        className="w-full pl-8 pr-2 py-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-base sm:text-sm bg-white disabled:bg-panel min-h-[44px]"
      />

      {open && menuRect && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width }}
          className="z-50 mt-1 bg-white border border-border rounded-md shadow-lg flex flex-col"
        >
          <div className="max-h-72 overflow-y-auto thin-scrollbar">
            {filteredItems.length === 0 ? (
              <div className="p-3 text-sm text-textMuted">No items found</div>
            ) : (
              filteredItems.map(i => (
                <div
                  key={i.id}
                  onClick={() => { onChange(i.id); setOpen(false); setQuery(''); }}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-panel/60 ${i.id === value ? 'bg-gold/10 font-medium text-textDark' : 'text-textDark'}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span>{i.name} · {i.bagKg}kg</span>
                    {/* Two records can share a name (a data problem being merged at
                        source). Showing category and stock lets the operator tell them
                        apart instead of guessing which one holds the bags. */}
                    <span className="text-xs text-textMuted shrink-0">
                      {i.categoryKey} · {Number(i.stock || 0)} bags
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
          {filteredItems.length > 6 && (
            <div className="px-3 py-1.5 text-[11px] text-textMuted border-t border-border bg-panel/30 shrink-0">
              {filteredItems.length} items · scroll for more
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function InvoiceRowsTable({ rows, items, onAddRow, onRemoveRow, onRowChange, onRowBlur, rowErrors = {}, rowWarnings = {} }) {
  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto max-h-[60vh]">
        <table className="w-full text-left border-collapse min-w-[650px]">
          <thead className="sticky top-0 z-10 bg-panel shadow-sm">
            <tr className="text-xs uppercase text-textMuted border-b border-border">
              <th className="py-3 px-3 font-medium w-[30%]">Item</th>
              <th className="py-3 px-3 font-medium w-[10%]">Bags</th>
              <th className="py-3 px-3 font-medium w-[10%]">Bag wt</th>
              <th className="py-3 px-3 font-medium w-[12%]">Total kgs</th>
              <th className="py-3 px-3 font-medium w-[16%]">MRP</th>
              <th className="py-3 px-3 font-medium text-right w-[16%]">Amount</th>
              <th className="py-3 px-3 w-[6%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const computedKgs = (row.itemId && row.bags && row.bagKg)
                ? Number(row.bags) * Number(row.bagKg)
                : 0;

              return (
                <tr key={row.id} className={`bg-white ${rowErrors[row.id] ? 'bg-red-50/20' : ''}`}>
                  <td className="p-2 align-top">
                    <ItemSearchSelect
                      value={row.itemId}
                      items={sortedItems}
                      onChange={(itemId) => onRowChange(row.id, 'itemId', itemId)}
                    />
                  </td>
                  <td className="p-2 align-top">
                    <input
                      type="number"
                      min="1"
                      value={row.bags}
                      onChange={(e) => onRowChange(row.id, 'bags', e.target.value)}
                      onBlur={() => onRowBlur && onRowBlur(row.id)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      disabled={!row.itemId}
                      className={`w-full p-2 rounded-md border text-base sm:text-sm disabled:bg-panel min-h-[44px] focus:outline-none ${
                        rowErrors[row.id]
                          ? 'border-debit text-debit font-medium focus:ring-2 focus:ring-debit'
                          : rowWarnings[row.id]
                          ? 'border-amber-500 focus:ring-2 focus:ring-amber-500'
                          : 'border-border focus:ring-2 focus:ring-gold/50'
                      }`}
                    />
                    {rowErrors[row.id] ? (
                      <p className="text-xs text-debit font-semibold mt-1 leading-tight">{rowErrors[row.id]}</p>
                    ) : rowWarnings[row.id] ? (
                      <p className="text-xs text-amber-600 font-medium mt-1 leading-tight">{rowWarnings[row.id]}</p>
                    ) : null}
                  </td>
                  <td className="p-2 align-top">
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        value={row.bagKg || ''}
                        onChange={(e) => onRowChange(row.id, 'bagKg', e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        disabled={!row.itemId}
                        className="w-full p-2 pr-8 rounded-md border border-border text-base sm:text-sm disabled:bg-panel min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gold/50"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-textMuted pointer-events-none">
                        kg
                      </span>
                    </div>
                  </td>
                  <td className="p-2 align-top">
                    <input
                      type="text"
                      readOnly
                      value={computedKgs > 0 ? `${computedKgs} kg` : '0 kg'}
                      className="w-full p-2 rounded-md border border-border bg-panel text-textDark text-base sm:text-sm min-h-[44px] cursor-not-allowed select-none"
                    />
                  </td>
                  <td className="p-2 align-top">
                    <input
                      type="number"
                      step="0.01"
                      value={row.mrp !== undefined && row.mrp !== null ? row.mrp : (row.rate || '')}
                      onChange={(e) => onRowChange(row.id, 'mrp', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      disabled={!row.itemId}
                      placeholder="MRP"
                      className="w-full p-2 rounded-md border border-border text-base sm:text-sm disabled:bg-panel min-h-[44px] focus:outline-none focus:ring-2 focus:ring-gold/50 font-semibold"
                    />
                  </td>
                  <td className="p-2 align-top text-right font-medium text-textDark text-sm pt-4">
                    {row.amount > 0 ? `₹${row.amount.toLocaleString('en-IN')}` : '₹0'}
                  </td>
                  <td className="p-2 align-top text-center pt-3">
                    <button
                      onClick={() => onRemoveRow(row.id)}
                      disabled={rows.length === 1}
                      className="p-1.5 text-textMuted hover:text-debit transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="bg-panel/30 p-3 border-t border-border">
        <button
          onClick={onAddRow}
          className="flex items-center gap-1.5 text-sm font-medium text-gold hover:text-gold/80 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Row
        </button>
      </div>
    </div>
  );
}
