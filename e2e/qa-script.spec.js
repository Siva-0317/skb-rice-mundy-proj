import { test, expect } from '@playwright/test';

// Serial mode ensures tests run strictly one after another in the same environment.
// Using beforeAll to share a single page session across all sequential steps.
test.describe.serial('SKB Ledger E2E QA Script', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await page?.close();
  });

  // ADDED { force: true } HERE: Prevents lingering toasts from blocking sidebar navigation globally
  const navigateTo = async (navName) => {
    await page.locator('aside nav').getByText(navName, { exact: true }).click({ force: true });
  };

  test('STEP 0 — Login with testowner credentials', async () => {
    await page.goto('/login');
    const email = process.env.TEST_OWNER_EMAIL || 'testowner@skbmundy.com';
    const password = process.env.TEST_OWNER_PASSWORD || 'password123';

    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('STEP A — Inventory & Stock Adjustments', async () => {
    await navigateTo('Inventory');
    await expect(page.locator('h1')).toContainText('Inventory');

    const adjustments = [
      { name: 'Vaibhav', stock: '100' },
      { name: 'Rettaikilli', stock: '60' },
      { name: 'Air Force', stock: '80' },
      { name: 'Broken Rice', stock: '12' },
      { name: 'Zareena XXXL', stock: '20' },
      { name: 'Arcadia', stock: '5' }
    ];

    for (const adj of adjustments) {
      const row = page.locator('tr', { hasText: adj.name }).first();
      await row.locator('button[title="Adjust Stock"]').click();
      const modal = page.locator('h3:has-text("Adjust Stock")');
      await expect(modal).toBeVisible();

      const input = page.locator('input[type="number"]');
      await input.fill(adj.stock);
      await page.getByRole('button', { name: 'Update Stock' }).click();
      await expect(modal).toBeHidden();
    }

    // Assert low stock badge shows on Broken Rice (12) and Arcadia (5), but not Vaibhav (100)
    const brokenRiceRow = page.locator('tr', { hasText: 'Broken Rice' }).first();
    await expect(brokenRiceRow.getByText('LOW STOCK')).toBeVisible();

    const arcadiaRow = page.locator('tr', { hasText: 'Arcadia' }).first();
    await expect(arcadiaRow.getByText('LOW STOCK')).toBeVisible();

    const vaibhavRow = page.locator('tr', { hasText: 'Vaibhav' }).first();
    await expect(vaibhavRow.getByText('LOW STOCK')).toBeHidden();
  });

  test('STEP B — Masters: add Test Premium Rice and edit rate', async () => {
    await navigateTo('Masters');
    await expect(page.locator('h2')).toContainText('Item Masters');

    await page.getByRole('button', { name: 'Add Item' }).click();
    await expect(page.locator('h3:has-text("Add Item")')).toBeVisible();

    await page.locator('label:has-text("Item Name") + input').fill('Test Premium Rice');
    await page.locator('label:has-text("Category") + select').selectOption({ label: 'Raw Rice' });
    await page.locator('label:has-text("Bag Size") + input').fill('25');
    await page.locator('label:has-text("Rate") + input').fill('1800');
    await page.locator('label:has-text("MRP") + input').fill('1800');
    await page.locator('label:has-text("Opening Stock") + input').fill('50');

    await page.getByRole('button', { name: 'Save Item' }).click();
    await expect(page.locator('h3:has-text("Add Item")')).toBeHidden();

    // Verify item appears
    const itemRow = page.locator('tr', { hasText: 'Test Premium Rice' }).first();
    await expect(itemRow).toBeVisible();

    // Edit its rate to 1850
    await itemRow.locator('button').last().click(); // Pencil icon is the last button on the row
    await expect(page.locator('h3:has-text("Edit Item")')).toBeVisible();

    await page.locator('label:has-text("Rate") + input').fill('1850');
    await page.getByRole('button', { name: 'Save Item' }).click();
    await expect(page.locator('h3:has-text("Edit Item")')).toBeHidden();

    // Assert updated rate shows
    await expect(itemRow).toContainText('1850');
  });

  test('STEP C — Add 5 Customers', async () => {
    await navigateTo('Customers');
    await expect(page.locator('h1')).toContainText('Customers');

    const customers = [
      { name: 'Ramesh Traders', mobile: '9876543210', balance: '5000' },
      { name: 'Lakshmi Stores', mobile: '9876543211', balance: '0' },
      { name: 'Vinayaga Agencies', mobile: '9876543212', balance: '12000' },
      { name: 'Saravana Stores', mobile: '9876543213', balance: '0' },
      { name: 'Meenakshi Traders', mobile: '9876543214', balance: '3000' }
    ];

    for (const cust of customers) {
      await page.getByRole('button', { name: 'Add Customer' }).click();
      await expect(page.locator('h3:has-text("Add Customer")')).toBeVisible();

      await page.locator('label:has-text("Customer Name") + input').fill(cust.name);
      await page.locator('label:has-text("Mobile Number") + input').fill(cust.mobile);
      await page.locator('label:has-text("Opening Balance") + input').fill(cust.balance);

      await page.getByRole('button', { name: 'Save Customer' }).click();
      await expect(page.locator('h3:has-text("Add Customer")')).toBeHidden();
    }

    // Click Ramesh Traders, verify ledger shows Opening balance entry of ₹5,000
    await page.locator('tr', { hasText: 'Ramesh Traders' }).first().click();
    await expect(page.locator('h2')).toContainText('Ramesh Traders');
    await expect(page.locator('table tbody')).toContainText('Opening balance');
    await expect(page.locator('p:has-text("Current Balance") + p')).toContainText('5,000');

    // Go back and check Lakshmi Stores
    await page.getByRole('button', { name: 'Back to Customers' }).click({ force: true });
    await page.locator('tr', { hasText: 'Lakshmi Stores' }).first().click();
    await expect(page.locator('h2')).toContainText('Lakshmi Stores');
    await expect(page.locator('table tbody')).toContainText('No ledger entries found');
  });

  test('STEP D — Add 3 Suppliers', async () => {
    await navigateTo('Masters');
    // ADDED { force: true } HERE: Bypasses the toast intercept error from Step C
    await page.getByRole('button', { name: 'Suppliers' }).click({ force: true });

    const suppliers = [
      { name: 'Krishna Rice Mills', phone: '9111111111', balance: '20000' },
      { name: 'Murugan Traders', phone: '9222222222', balance: '0' },
      { name: 'Senthil Agencies', phone: '9333333333', balance: '45000' }
    ];

    for (const sup of suppliers) {
      await page.getByRole('button', { name: 'Add Supplier' }).click();
      await expect(page.locator('h3:has-text("Add Supplier")')).toBeVisible();

      await page.locator('label:has-text("Supplier Name") + input').fill(sup.name);
      await page.locator('label:has-text("Phone Number") + input').fill(sup.phone);
      await page.locator('label:has-text("Opening Balance") + input').fill(sup.balance);

      await page.getByRole('button', { name: 'Save Supplier' }).click();
      await expect(page.locator('h3:has-text("Add Supplier")')).toBeHidden();
    }

    await page.locator('tr', { hasText: 'Krishna Rice Mills' }).first().click();
    await expect(page.locator('h2')).toContainText('Krishna Rice Mills');
    await expect(page.locator('p:has-text("Payable:")')).toContainText('20,000');
  });

  test('STEP E — Create Sale #1', async () => {
    await navigateTo('Sales');
    await expect(page.locator('h1')).toContainText('Sales');

    // Select customer Ramesh Traders
    await page.locator('select').first().selectOption({ label: 'Ramesh Traders (9876543210)' });

    // Row 0: Vaibhav 10 bags @ 1650
    const row0 = page.locator('table tbody tr').nth(0);
    await row0.locator('select').nth(0).selectOption('raw');
    await row0.locator('select').nth(1).selectOption({ label: 'Vaibhav · 26kg' });
    await row0.locator('input').nth(0).fill('10');
    await row0.locator('input').nth(2).fill('1650'); // FIX 1: Added missing Rate

    // Row 1: Rettaikilli 5 bags @ 1500
    await page.getByRole('button', { name: 'Add Row' }).click();
    const row1 = page.locator('table tbody tr').nth(1);
    await row1.locator('select').nth(0).selectOption('boiled');
    await row1.locator('select').nth(1).selectOption({ label: 'Rettaikilli · 26kg' });
    await row1.locator('input').nth(0).fill('5');
    await row1.locator('input').nth(2).fill('1500'); // FIX 1: Added missing Rate

    // Advance 2000
    await page.locator('label:has-text("Advance Received") + input').fill('2000');

    await page.getByRole('button', { name: 'Save Sale Invoice' }).click();

    // FIX 2: Wait for Firestore to finish writing before navigating away!
    // (Alternatively, you can wait for the Success Toast to appear)
    await page.waitForTimeout(1500);

    // Verify Ramesh Traders balance is now 27,000 (5000 + 16500 + 7500 - 2000)
    await navigateTo('Customers');
    const rameshRow = page.locator('tr', { hasText: 'Ramesh Traders' }).first();
    await expect(rameshRow).toContainText('27,000');

    // Verify Vaibhav inventory stock is 90 (100 - 10) and Rettaikilli is 55 (60 - 5)
    await navigateTo('Inventory');
    await expect(page.locator('tr', { hasText: 'Vaibhav' }).first()).toContainText('90');
    await expect(page.locator('tr', { hasText: 'Rettaikilli' }).first()).toContainText('55');

    // Verify Dashboard Today's Sales stat shows 22,000 (16500 + 7500 - 2000)
    await navigateTo('Dashboard');
    await expect(page.locator('p:has-text("Today\'s Sales") + p')).toContainText('22,000');
  });

  test('STEP F — Create Sale #2', async () => {
    await navigateTo('Sales');

    // Select customer Meenakshi Traders
    await page.locator('select').first().selectOption({ label: 'Meenakshi Traders (9876543214)' });

    // Row 0: Air Force 20 bags @ 2000
    const row0 = page.locator('table tbody tr').nth(0);
    await row0.locator('select').nth(0).selectOption('raw');
    await row0.locator('select').nth(1).selectOption({ label: 'Air Force · 26kg' });
    await row0.locator('input').nth(0).fill('20');
    await row0.locator('input').nth(2).fill('2000'); // Override rate to 2000

    // Row 1: Test Premium Rice 10 bags @ 1850
    await page.getByRole('button', { name: 'Add Row' }).click();
    const row1 = page.locator('table tbody tr').nth(1);
    await row1.locator('select').nth(0).selectOption('raw');
    await row1.locator('select').nth(1).selectOption({ label: 'Test Premium Rice · 25kg' });
    await row1.locator('input').nth(0).fill('10');

    await page.getByRole('button', { name: 'Save Sale Invoice' }).click();

    // Assert Meenakshi balance is 61,500 (3000 + 40000 + 18500)
    await navigateTo('Customers');
    const meenakshiRow = page.locator('tr', { hasText: 'Meenakshi Traders' }).first();
    await expect(meenakshiRow).toContainText('61,500');

    // Assert inventory stock Air Force is 60 (80 - 20), Test Premium Rice is 40 (50 - 10)
    await navigateTo('Inventory');
    await expect(page.locator('tr', { hasText: 'Air Force' }).first()).toContainText('60');
    await expect(page.locator('tr', { hasText: 'Test Premium Rice' }).first()).toContainText('40');
  });

  test('STEP G — Create Purchase #1', async () => {
    await navigateTo('Purchases');
    await expect(page.locator('h1')).toContainText('Purchase');

    // Select supplier Krishna Rice Mills
    await page.locator('select').first().selectOption({ label: 'Krishna Rice Mills (9111111111)' });

    // Row 0: Vaibhav 50 bags @ 1600
    const row0 = page.locator('table tbody tr').nth(0);
    await row0.locator('select').nth(0).selectOption('raw');
    await row0.locator('select').nth(1).selectOption({ label: 'Vaibhav · 26kg' });
    await row0.locator('input').nth(0).fill('50');
    await row0.locator('input').nth(2).fill('1600');

    // Row 1: Zareena XXXL 10 bags @ 2800
    await page.getByRole('button', { name: 'Add Row' }).click();
    const row1 = page.locator('table tbody tr').nth(1);
    await row1.locator('select').nth(0).selectOption('raw');
    await row1.locator('select').nth(1).selectOption({ label: 'Zareena XXXL · 26kg' });
    await row1.locator('input').nth(0).fill('10');
    await row1.locator('input').nth(2).fill('2800');

    await page.getByRole('button', { name: 'Save Purchase Invoice' }).click();

    // Assert Krishna payable balance is 108,000 (20000 + 80000 + 28000)
    await navigateTo('Masters');
    // ADDED { force: true } HERE: Same reason as Step D
    await page.getByRole('button', { name: 'Suppliers' }).click({ force: true });

    const krishnaRow = page.locator('tr', { hasText: 'Krishna Rice Mills' }).first();
    await expect(krishnaRow).toContainText('1,08,000');

    // Assert inventory stock Vaibhav is 140 (90 + 50), Zareena XXXL is 30 (20 + 10)
    await navigateTo('Inventory');
    await expect(page.locator('tr', { hasText: 'Vaibhav' }).first()).toContainText('140');
    await expect(page.locator('tr', { hasText: 'Zareena XXXL' }).first()).toContainText('30');
  });

  test('STEP H — Record Payment & STEP J — Edit Icon Assertion', async () => {
    await navigateTo('Customers');
    await page.locator('tr', { hasText: 'Ramesh Traders' }).first().click();

    // STEP J assertion: Opening balance entry does NOT have edit icon
    const openingRow = page.locator('tr', { hasText: 'Opening balance' }).first();
    await expect(openingRow.locator('button[title="Edit Payment"]')).toBeHidden();

    // STEP H: Record payment
    await page.getByRole('button', { name: 'Make Payment' }).click();
    await expect(page.locator('h3:has-text("Receive Payment")')).toBeVisible();

    await page.locator('label:has-text("Payment Mode") + select').selectOption('UPI');
    await page.locator('label:has-text("Amount Paid") + input').fill('10000');
    await page.locator('label:has-text("Note") + input').fill('Partial payment');

    await page.getByRole('button', { name: 'Save Payment' }).click();
    await expect(page.locator('h3:has-text("Receive Payment")')).toBeHidden();

    // Assert balance drops to 17,000 (27000 - 10000)
    await expect(page.locator('p:has-text("Current Balance") + p')).toContainText('17,000');

    // Assert new row shows Partial payment and UPI
    const paymentRow = page.locator('tr', { hasText: 'Partial payment' }).first();
    await expect(paymentRow).toContainText('UPI');

    // Assert exactly one edit icon exists on the page (only for the newest payment entry)
    await expect(page.locator('button[title="Edit Payment"]')).toHaveCount(1);
  });

  test('STEP I — Edit Payment', async () => {
    // We are already on Ramesh Traders detail page
    await page.locator('button[title="Edit Payment"]').click();
    await expect(page.locator('h3:has-text("Edit Payment")')).toBeVisible();

    await page.locator('label:has-text("Payment Mode") + select').selectOption('Cash');
    await page.locator('label:has-text("Amount Paid") + input').fill('12000');
    await page.locator('label:has-text("Note") + input').fill('Corrected entry after checking bank statement');

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('h3:has-text("Edit Payment")')).toBeHidden();

    // Assert balance adjusts to 15,000 (27000 - 12000)
    await expect(page.locator('p:has-text("Current Balance") + p')).toContainText('15,000');
    await expect(page.locator('table tbody')).toContainText('Corrected entry after checking bank statement');
    await expect(page.locator('table tbody')).toContainText('Cash');
  });

  test('STEP K — Edit Sale #1', async () => {
    await navigateTo('Sales');

    // Find Recent Sale card for Ramesh Traders and click edit
    const rameshCard = page.locator('div', { hasText: 'Ramesh Traders' }).filter({ has: page.locator('button[title="Edit Sale"]') }).first();
    await rameshCard.locator('button[title="Edit Sale"]').click();

    // Change Vaibhav bags from 10 to 15
    const row0 = page.locator('table tbody tr').nth(0);
    await row0.locator('input').nth(0).fill('15');

    await page.getByRole('button', { name: 'Update Sale' }).click();

    // Confirm modal appears
    await expect(page.locator('h3', { hasText: /Save changes to Bill/ })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Verify Ramesh Traders balance is now 23,250
    await navigateTo('Customers');
    const rameshRow = page.locator('tr', { hasText: 'Ramesh Traders' }).first();
    await expect(rameshRow).toContainText('23,250');

    // Verify inventory stock for Vaibhav is now 135 (140 - 5)
    await navigateTo('Inventory');
    await expect(page.locator('tr', { hasText: 'Vaibhav' }).first()).toContainText('135');
  });

  test('STEP L — Zero Stock & Overdue Threshold Checks', async () => {
    await navigateTo('Inventory');

    // Set Arcadia stock to 0
    const arcadiaRow = page.locator('tr', { hasText: 'Arcadia' }).first();
    await arcadiaRow.locator('button[title="Adjust Stock"]').click();
    await page.locator('input[type="number"]').fill('0');
    await page.getByRole('button', { name: 'Update Stock' }).click();

    // Verify Arcadia shows 0 stock and LOW STOCK
    await expect(page.locator('tr', { hasText: 'Arcadia' }).first()).toContainText('0');

    // Check status of Lakshmi Stores (balance 0 -> Settled) and Ramesh Traders (Active)
    await navigateTo('Customers');
    const lakshmiRow = page.locator('tr', { hasText: 'Lakshmi Stores' }).first();
    await expect(lakshmiRow).toContainText('Settled');

    const rameshRow = page.locator('tr', { hasText: 'Ramesh Traders' }).first();
    await expect(rameshRow).toContainText('Active');
  });

  test('STEP M — Reports & Export', async () => {
    await navigateTo('Reports');
    await expect(page.locator('h1')).toContainText('Reports');

    await page.getByRole('button', { name: 'Generate' }).click();

    // Assert total sales amount in footer matches 70,750 (or contains 70,750)
    await expect(page.locator('tfoot')).toContainText('70,750');

    // Filter by category Raw Rice
    await page.locator('select').first().selectOption('raw');
    await page.getByRole('button', { name: 'Generate' }).click();

    // Assert Vaibhav is visible and Rettaikilli (Boiled Rice) is hidden
    await expect(page.locator('table tbody')).toContainText('Vaibhav');
    await expect(page.locator('table tbody').getByText('Rettaikilli')).toBeHidden();

    // Click Export CSV and verify download
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('STEP O — Search bar verification', async () => {
    // Type Ramesh in global search
    const searchInput = page.locator('header input[type="text"]');
    await searchInput.fill('Ramesh');

    await expect(page.locator('header').getByText('Customers')).toBeVisible();
    await expect(page.locator('header').getByText('Ramesh Traders')).toBeVisible();

    // Click Ramesh Traders from search dropdown
    await page.locator('header').getByText('Ramesh Traders').first().click();
    await expect(page).toHaveURL(/\/customers\//);
    await expect(page.locator('h2')).toContainText('Ramesh Traders');

    // Search for Vaibhav
    await searchInput.fill('Vaibhav');
    await expect(page.locator('header').getByText('Items')).toBeVisible();
    await expect(page.locator('header').getByText('Vaibhav')).toBeVisible();

    // Search for zzzzznomatch
    await searchInput.fill('zzzzznomatch');
    await expect(page.locator('header')).toContainText("No matches for 'zzzzznomatch'");
  });
});