import { Plus, Trash2 } from 'lucide-react';

export default function InvoiceRowsTable({ rows, categories, items, onAddRow, onRemoveRow, onRowChange }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto max-h-[60vh]">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead className="sticky top-0 z-10 bg-panel shadow-sm">
            <tr className="text-xs uppercase text-textMuted border-b border-border">
              <th className="py-3 px-4 font-medium w-[20%]">Category</th>
              <th className="py-3 px-4 font-medium w-[30%]">Item</th>
              <th className="py-3 px-4 font-medium w-[12%]">Bags</th>
              <th className="py-3 px-4 font-medium w-[12%]">Kg/Bag</th>
              <th className="py-3 px-4 font-medium w-[12%]">Rate (₹)</th>
              <th className="py-3 px-4 font-medium text-right w-[14%]">Amount</th>
              <th className="py-3 px-4 w-[5%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="bg-white">
                <td className="p-2">
                  <select
                    value={row.categoryKey}
                    onChange={(e) => onRowChange(row.id, 'categoryKey', e.target.value)}
                    className="w-full p-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-base sm:text-sm bg-white min-h-[44px]"
                  >
                    <option value="">Category</option>
                    {categories.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <select
                    value={row.itemId}
                    onChange={(e) => onRowChange(row.id, 'itemId', e.target.value)}
                    disabled={!row.categoryKey}
                    className="w-full p-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-base sm:text-sm bg-white disabled:bg-panel min-h-[44px]"
                  >
                    <option value="">Select Item</option>
                    {items.filter(i => i.categoryKey === row.categoryKey).map(i => (
                      <option key={i.id} value={i.id}>{i.name} · {i.bagKg}kg</option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    min="1"
                    value={row.bags}
                    onChange={(e) => onRowChange(row.id, 'bags', e.target.value)}
                    placeholder="0"
                    disabled={!row.itemId}
                    className="w-full p-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-base sm:text-sm disabled:bg-panel min-h-[44px]"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={row.bagKg}
                    onChange={(e) => onRowChange(row.id, 'bagKg', e.target.value)}
                    disabled={!row.itemId}
                    className="w-full p-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-base sm:text-sm disabled:bg-panel min-h-[44px]"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={row.rate}
                    onChange={(e) => onRowChange(row.id, 'rate', e.target.value)}
                    disabled={!row.itemId}
                    className="w-full p-2 rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-gold/50 text-base sm:text-sm disabled:bg-panel min-h-[44px]"
                  />
                </td>
                <td className="p-2 text-right font-medium text-textDark text-sm">
                  {row.amount > 0 ? `₹${row.amount.toLocaleString('en-IN')}` : '-'}
                </td>
                <td className="p-2 text-center">
                  <button
                    onClick={() => onRemoveRow(row.id)}
                    disabled={rows.length === 1}
                    className="p-1.5 text-textMuted hover:text-debit transition-colors disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
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
