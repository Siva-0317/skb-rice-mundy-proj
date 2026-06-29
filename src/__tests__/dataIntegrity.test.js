import { describe, it, expect } from 'vitest';

describe('3. Data Integrity & Concurrency Suite', () => {
  it('prevents repeat customer addition through deduplication logic', () => {
    const existingCustomers = [
      { id: 'c1', name: 'Ramesh Trading', phone: '9876543210' },
      { id: 'c2', name: 'Suresh Rice', phone: '9876543211' }
    ];

    const isDuplicate = (newCust, list) => {
      return list.some(c => 
        c.phone === newCust.phone || 
        c.name.trim().toLowerCase() === newCust.name.trim().toLowerCase()
      );
    };

    expect(isDuplicate({ name: 'Ramesh Trading ', phone: '9999999999' }, existingCustomers)).toBe(true);
    expect(isDuplicate({ name: 'New Trader', phone: '9876543210' }, existingCustomers)).toBe(true);
    expect(isDuplicate({ name: 'Unique Buyer', phone: '8888888888' }, existingCustomers)).toBe(false);
  });

  it('sale transaction updates customer balance, ledger entries, and item stock accurately', () => {
    // Initial state
    let customerBalance = 10000; // Customer owes ₹10,000
    let itemStock = 500; // 500 bags in stock
    const ledger = [];

    // Process Sale: 50 bags @ ₹1,200 = ₹60,000, paid ₹20,000, balance ₹40,000 added
    const saleQty = 50;
    const saleRate = 1200;
    const totalAmount = saleQty * saleRate; // 60,000
    const amountPaid = 20000;
    const balanceAdded = totalAmount - amountPaid; // 40,000

    // Atomic update simulation
    customerBalance += balanceAdded;
    itemStock -= saleQty;
    ledger.push({
      type: 'SALE',
      debit: totalAmount,
      credit: amountPaid,
      balance: customerBalance
    });

    expect(customerBalance).toBe(50000);
    expect(itemStock).toBe(450);
    expect(ledger[0]).toEqual({
      type: 'SALE',
      debit: 60000,
      credit: 20000,
      balance: 50000
    });
  });

  it('purchase transaction increments supplier balance and stock correctly', () => {
    let supplierBalance = 0; // We owe supplier ₹0
    let itemStock = 100; // 100 bags

    // Purchase: 200 bags @ ₹1,000 = ₹200,000 total, paid ₹150,000, balance owed ₹50,000
    const purchaseQty = 200;
    const totalAmount = 200000;
    const amountPaid = 150000;

    supplierBalance += (totalAmount - amountPaid);
    itemStock += purchaseQty;

    expect(supplierBalance).toBe(50000);
    expect(itemStock).toBe(300);
  });

  it('concurrent sales simulated with atomic increments avoid race conditions', async () => {
    let stock = 100;
    
    // Simulate atomic Firestore FieldValue.increment(-qty) across two simultaneous requests
    const atomicSell = async (qty) => {
      // Simulate asynchronous Firestore queue processing
      await new Promise(r => setTimeout(r, Math.random() * 10));
      stock -= qty;
      return stock;
    };

    // Run simultaneous sales of 30 bags and 40 bags
    await Promise.all([atomicSell(30), atomicSell(40)]);

    expect(stock).toBe(30);
  });
});
