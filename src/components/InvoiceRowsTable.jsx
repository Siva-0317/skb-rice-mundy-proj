import { Plus, Trash2 } from 'lucide-react';

export default function InvoiceRowsTable({ rows, categories, items, onAddRow, onRemoveRow, onRowChange, onRowBlur, rowErrors = {}, rowWarnings = {} }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto max-h-[60vh]">
        <table className="w-full text-left border-collapse min-w-[750px]">
          <thead className="sticky top-0 z-10 bg-panel shadow-sm">
            <tr className="text-xs uppercase text-textMuted border-b border-border">
              <th className="py-3 px-3 font-medium w-[15%]">Category</th>
              <th className="py-3 px-3 font-medium w-[20%]">Item</th>
              <th className="py-3 px-3 font-medium w-[8%]">Bags</th>
              <th className="py-3 px-3 font-medium w-[8%]">Bag wt</th>
              <th className="py-3 px-3 font-medium w-[9%]">Total kgs</th>
              <th className="py-3 px-3 font-medium w-[13%]">Rate (₹)</th>
              <th className="py-3 px-3 font-medium w-[13%]">MRP (₹)</th>
              <th className="py-3 px-3 font-medium text-right w-[10%]">Amount</th>
              <th className="py-3 px-3 w-[4%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const filteredItems = row.categoryKey 
                ? items.filter(i => i.categoryKey === row.categoryKey)
                : items;
              const computedKgs = (row.itemId && row.bags && row.bagKg)
                ? Number(row.bags) * Number(row.bagKg)
                : 0;

              return (
                <tr key={row.id} className={`bg-white ${rowErrors[row.id] ? 'bg-red-50/20' : ''}`}>
                  <td className="p-2 align-top">
                    <select
                      value={row.categoryKey}
                      onChange={(e) => onRowChange(row.id, 'categoryKey', e.target.value)}
                      className="w-full p-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-base sm:text-sm bg-white min-h-[44px]"
                    >
                      <option value="">All categories</option>
                      {categories.map(c => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 align-top">
                    <select
                      value={row.itemId}
                      onChange={(e) => onRowChange(row.id, 'itemId', e.target.value)}
                      disabled={filteredItems.length === 0}
                      className="w-full p-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-base sm:text-sm bg-white disabled:bg-panel min-h-[44px]"
                    >
                      <option value="">Select item...</option>
                      {filteredItems.map(i => (
                        <option key={i.id} value={i.id}>{i.name} · {i.bagKg}kg</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 align-top">
                    <input
                      type="number"
                      min="1"
                      value={row.bags}
                      onChange={(e) => onRowChange(row.id, 'bags', e.target.value)}
                      onBlur={() => onRowBlur && onRowBlur(row.id)}
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
                    <input
                      type="text"
                      readOnly
                      value={row.itemId && row.bagKg ? `${row.bagKg} kg` : '0 kg'}
                      className="w-full p-2 rounded-md border border-border bg-panel text-textDark text-base sm:text-sm min-h-[44px] cursor-not-allowed select-none"
                    />
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
                    <div className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`price-${row.id}`}
                        checked={row.priceField === 'rate'}
                        onChange={() => onRowChange(row.id, 'priceField', 'rate')}
                        disabled={!row.itemId}
                        className="text-gold focus:ring-gold cursor-pointer"
                        title="Use Rate for billing"
                      />
                      <input
                        type="number"
                        value={row.rate}
                        onChange={(e) => onRowChange(row.id, 'rate', e.target.value)}
                        onFocus={() => onRowChange(row.id, 'priceField', 'rate')}
                        disabled={!row.itemId}
                        placeholder="Rate"
                        className={`w-full p-2 rounded-md border text-base sm:text-sm disabled:bg-panel min-h-[44px] focus:outline-none ${row.priceField === 'rate' ? 'border-gold ring-1 ring-gold bg-gold/5 font-semibold' : 'border-border'}`}
                      />
                    </div>
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`price-${row.id}`}
                        checked={row.priceField !== 'rate'}
                        onChange={() => onRowChange(row.id, 'priceField', 'mrp')}
                        disabled={!row.itemId}
                        className="text-gold focus:ring-gold cursor-pointer"
                        title="Use MRP for billing"
                      />
                      <input
                        type="number"
                        value={row.mrp !== undefined ? row.mrp : row.rate}
                        onChange={(e) => onRowChange(row.id, 'mrp', e.target.value)}
                        onFocus={() => onRowChange(row.id, 'priceField', 'mrp')}
                        disabled={!row.itemId}
                        placeholder="MRP"
                        className={`w-full p-2 rounded-md border text-base sm:text-sm disabled:bg-panel min-h-[44px] focus:outline-none ${row.priceField !== 'rate' ? 'border-gold ring-1 ring-gold bg-gold/5 font-semibold' : 'border-border'}`}
                      />
                    </div>
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

