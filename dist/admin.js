(() => {
  const status = document.querySelector('#admin-status');
  const loginPanel = document.querySelector('#admin-login');
  const loginForm = document.querySelector('#admin-login-form');
  const loginStatus = document.querySelector('#admin-login-status');
  const workspace = document.querySelector('#admin-workspace');
  const adminTools = document.querySelector('#admin-tools');
  const customerForm = document.querySelector('#customer-form');
  const recordForm = document.querySelector('#record-form');
  const customerRows = document.querySelector('#customer-rows');
  const recordRows = document.querySelector('#record-rows');
  const inquiryRows = document.querySelector('#inquiry-rows');
  const customerSelect = document.querySelector('#record-customer');
  const kindSelect = recordForm.elements.kind;
  const recordStatus = recordForm.elements.status;
  const recordSubmit = document.querySelector('#record-submit');
  const documentEditor = document.querySelector('#document-editor');
  const documentLines = document.querySelector('#document-lines');
  const statuses = {
    quote: ['draft', 'sent', 'accepted', 'declined', 'expired'],
    sale: ['pending', 'complete', 'refunded'],
    invoice: ['draft', 'sent', 'partially paid', 'paid', 'overdue', 'cancelled'],
  };
  let customers = [];
  let records = [];
  let inquiries = [];

  const showWorkspace = (authenticated) => {
    loginPanel.hidden = authenticated;
    workspace.hidden = !authenticated;
    adminTools.hidden = !authenticated;
  };

  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  };

  const addCell = (row, text) => {
    const cell = document.createElement('td');
    cell.textContent = text || '—';
    row.append(cell);
    return cell;
  };

  const updateStatusOptions = (selected) => {
    const values = statuses[kindSelect.value] || statuses.quote;
    recordStatus.replaceChildren(...values.map((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value.replace(/\b\w/g, (character) => character.toUpperCase());
      return option;
    }));
    if (selected && values.includes(selected)) recordStatus.value = selected;
    recordSubmit.textContent = kindSelect.value === 'sale' ? 'Save sale' : `Create ${kindSelect.value}`;
    const isDocument = kindSelect.value === 'quote' || kindSelect.value === 'invoice';
    documentEditor.hidden = !isDocument;
    document.querySelector('#record-details-field').hidden = isDocument;
    document.querySelector('#record-amount-field').hidden = isDocument;
    recordForm.elements.amount.required = !isDocument;
    customerSelect.required = isDocument;
    recordForm.elements.reference.required = isDocument;
    document.querySelector('#record-title-label').textContent = isDocument ? 'Brief summary' : 'Title';
    document.querySelector('#record-reference-label').textContent = kindSelect.value === 'invoice' ? 'Invoice no.' : kindSelect.value === 'quote' ? 'Quote no.' : 'Reference / number';
    document.querySelector('#record-date-label').textContent = isDocument ? 'Date' : 'Record date';
    document.querySelector('#record-due-date-label').textContent = kindSelect.value === 'quote' ? 'Valid until' : 'Due date';
    document.querySelector('#document-notes-label').textContent = kindSelect.value === 'invoice' ? 'Payment details and notes' : 'Terms and notes';
    if (isDocument && !documentLines.children.length) addDocumentLine();
    updateDocumentTotals();
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);

  const readDocumentDetails = (record) => {
    try {
      const data = JSON.parse(record.details || '');
      if (data?.template === 'solv-it-a4-v1' && Array.isArray(data.lines)) return data;
    } catch {}
    return {
      template: 'solv-it-a4-v1',
      billingAddress: '',
      taxRate: 0,
      notes: record.kind === 'invoice'
        ? '[Bank / payment details, accepted payment methods, and any notes.]'
        : '[Add scope, assumptions, exclusions, payment schedule, and acceptance instructions.]',
      lines: [{ item: record.title, description: record.details || '', quantity: 1, unitPrice: Number(record.amount_cents || 0) / 100 }],
    };
  };

  const money = (value) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const printDocument = (record) => {
    const label = record.kind === 'quote' ? 'QUOTE' : 'INVOICE';
    const details = readDocumentDetails(record);
    const lines = details.lines.slice(0, 11);
    const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
    const tax = subtotal * Number(details.taxRate || 0) / 100;
    const total = subtotal + tax;
    const date = escapeHtml(record.record_date || '');
    const customerContact = [record.customer_email, record.customer_phone].filter(Boolean).map(escapeHtml).join(' | ');
    const lineRows = [...lines, ...Array.from({ length: Math.max(0, 11 - lines.length) }, () => null)].map((line) => `
      <tr><td>${line ? escapeHtml(line.item) : '&nbsp;'}</td><td>${line ? escapeHtml(line.description) : '&nbsp;'}</td><td class="numeric">${line ? escapeHtml(line.quantity) : '&nbsp;'}</td><td class="numeric">${line ? money(line.unitPrice) : '&nbsp;'}</td><td class="numeric">${line ? money(Number(line.quantity) * Number(line.unitPrice)) : '&nbsp;'}</td></tr>`).join('');
    const notes = escapeHtml(details.notes || (record.kind === 'invoice'
      ? '[Bank / payment details, accepted payment methods, and any notes.]'
      : '[Add scope, assumptions, exclusions, payment schedule, and acceptance instructions.]'));
    const popup = window.open('', '_blank');
    if (!popup) {
      status.textContent = 'Allow pop-ups for this site to print the document.';
      return;
    }
    popup.document.write(`<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label} ${escapeHtml(record.reference || record.title)}</title><style>
      @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#111;font-family:Carlito,Arial,sans-serif;font-size:11pt;line-height:1.2}.document{width:100%;max-width:190mm;margin:0 auto}.sheet{width:100%;border-collapse:collapse;table-layout:fixed}.sheet td,.items th,.items td{border:1px solid #b7b7b7;padding:2.2mm 2.4mm;vertical-align:middle}.sheet .document-heading{font-size:18pt;font-weight:700;height:12mm}.sheet .company{font-size:14pt;font-weight:700;height:9mm}.sheet .contact{font-size:9pt;height:7mm}.sheet .space td{height:4mm;padding:0}.sheet .label{font-weight:700}.sheet .summary{font-style:italic;height:9mm}.items{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:0}.items th{text-align:center;font-weight:700;height:9mm}.items td{height:7mm}.items .numeric{text-align:right;white-space:nowrap}.totals{width:42%;margin-left:auto;border-collapse:collapse;table-layout:fixed}.totals td{border:1px solid #b7b7b7;padding:2mm 2.4mm}.totals td:last-child{text-align:right}.totals .grand td{font-size:12pt;font-weight:700}.notes-title{font-weight:700}.notes{white-space:pre-wrap;min-height:17mm;vertical-align:top!important}.acceptance{height:24mm;vertical-align:top!important}.thank-you{font-weight:700;height:12mm}@media screen{body{padding:16px;background:#e8edf1}.document{min-height:277mm;padding:10mm;background:#fff;box-shadow:0 4px 18px #0002}}@media print{.document{max-width:none}.sheet,.items,.totals{break-inside:avoid}.items tr,.totals tr{break-inside:avoid}}
      </style></head><body><main class="document"><table class="sheet"><colgroup><col style="width:25%"><col style="width:27%"><col style="width:10%"><col style="width:21%"><col style="width:17%"></colgroup><tbody>
      <tr><td class="document-heading" colspan="5">${label}</td></tr>
      <tr><td class="company" colspan="5">&gt; Solv_IT Computer Solutions</td></tr>
      <tr><td class="contact" colspan="5">44 Heritage Villas | 082 0593491 | zanderbooyzen@gmail.com | &nbsp;[Tax/VAT number, if applicable]</td></tr>
      <tr class="space"><td colspan="5"></td></tr>
      <tr><td class="label" colspan="3">Bill to</td><td class="label">${record.kind === 'quote' ? 'Quote no.' : 'Invoice no.'}</td><td>${escapeHtml(record.reference || '')}</td></tr>
      <tr><td class="label">Customer name</td><td colspan="2">${escapeHtml(record.customer_name || '')}</td><td class="label">Date</td><td>${date}</td></tr>
      <tr><td class="label">Address</td><td colspan="2">${escapeHtml(details.billingAddress || '')}</td><td class="label">${record.kind === 'quote' ? 'Valid until' : 'Due date'}</td><td>${escapeHtml(record.due_date || '')}</td></tr>
      <tr><td class="label">Email / phone</td><td colspan="2">${customerContact}</td><td class="label">Reference / PO</td><td>${escapeHtml(details.referencePo || '')}</td></tr>
      <tr class="space"><td colspan="5"></td></tr>
      <tr><td class="summary" colspan="5">${escapeHtml(record.title || '')}</td></tr>
      <tr class="space"><td colspan="5"></td></tr>
      </tbody></table><table class="items"><colgroup><col style="width:20%"><col style="width:35%"><col style="width:10%"><col style="width:17%"><col style="width:18%"></colgroup><thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>${lineRows}</tbody></table>
      <table class="totals"><tbody><tr><td>Subtotal</td><td>${money(subtotal)}</td></tr><tr><td>Tax/VAT rate</td><td>${money(details.taxRate || 0)}%</td></tr><tr><td>Tax/VAT</td><td>${money(tax)}</td></tr><tr class="grand"><td>Total</td><td>${money(total)}</td></tr></tbody></table>
      <table class="sheet"><tbody><tr class="space"><td colspan="5"></td></tr><tr><td class="notes-title" colspan="5">${record.kind === 'invoice' ? 'Payment details and notes' : 'Terms and notes'}</td></tr><tr><td class="notes" colspan="5">${notes}</td></tr><tr class="space"><td colspan="5"></td></tr>${record.kind === 'invoice'
        ? '<tr><td class="thank-you" colspan="5">Thank you for your business</td></tr><tr><td colspan="5">[Add any required remittance or contact instructions.]</td></tr>'
        : '<tr><td class="label" colspan="5">Acceptance</td></tr><tr><td class="acceptance" colspan="5">[Customer approval / signature] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [Name] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [Date]</td></tr>'}</tbody></table>
      </main><script>window.addEventListener('load',()=>window.print())</script></body></html>`);
    popup.document.close();
  };

  const addDocumentLine = () => {
    if (documentLines.children.length >= 11) {
      status.textContent = 'The quote and invoice templates allow up to 11 item lines.';
      return;
    }
    const row = documentLines.insertRow();
    row.className = 'document-line';
    const fields = [
      { name: 'item', label: 'Item', maxLength: 120, required: true },
      { name: 'description', label: 'Description', maxLength: 180 },
      { name: 'quantity', label: 'Quantity', type: 'number', min: '1', step: '1', value: '1', required: true },
      { name: 'unitPrice', label: 'Unit price', type: 'number', min: '0', max: '1000000000', step: '0.01', value: '0', required: true },
    ];
    for (const field of fields) {
      const cell = row.insertCell();
      const input = document.createElement('input');
      input.name = field.name;
      input.setAttribute('aria-label', field.label);
      input.required = Boolean(field.required);
      if (field.maxLength) input.maxLength = field.maxLength;
      if (field.type) input.type = field.type;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      if (field.value !== undefined) input.value = field.value;
      input.addEventListener('input', updateDocumentTotals);
      cell.append(input);
    }
    const total = row.insertCell();
    total.className = 'numeric';
    total.dataset.lineTotal = '';
    total.textContent = '0.00';
    const removeCell = row.insertCell();
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-delete';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove item line');
    remove.addEventListener('click', () => {
      if (documentLines.children.length === 1) {
        row.querySelector('[name="item"]').value = '';
        row.querySelector('[name="description"]').value = '';
        row.querySelector('[name="quantity"]').value = '1';
        row.querySelector('[name="unitPrice"]').value = '0';
      } else row.remove();
      updateDocumentTotals();
    });
    removeCell.append(remove);
    updateDocumentTotals();
    row.querySelector('[name="item"]').focus();
  };

  const getDocumentLines = () => Array.from(documentLines.querySelectorAll('.document-line')).map((row) => ({
    item: row.querySelector('[name="item"]').value.trim(),
    description: row.querySelector('[name="description"]').value.trim(),
    quantity: Number(row.querySelector('[name="quantity"]').value),
    unitPrice: Number(row.querySelector('[name="unitPrice"]').value),
  })).filter((line) => line.item);

  function updateDocumentTotals() {
    if (!documentLines) return;
    let subtotal = 0;
    for (const row of documentLines.querySelectorAll('.document-line')) {
      const quantity = Number(row.querySelector('[name="quantity"]').value) || 0;
      const unitPrice = Number(row.querySelector('[name="unitPrice"]').value) || 0;
      const lineTotal = quantity * unitPrice;
      subtotal += lineTotal;
      row.querySelector('[data-line-total]').textContent = money(lineTotal);
    }
    const taxRate = Number(recordForm.elements.taxRate?.value) || 0;
    const tax = subtotal * taxRate / 100;
    document.querySelector('#document-subtotal').textContent = money(subtotal);
    document.querySelector('#document-tax').textContent = money(tax);
    document.querySelector('#document-total').textContent = money(subtotal + tax);
    if (kindSelect.value === 'quote' || kindSelect.value === 'invoice') recordForm.elements.amount.value = (subtotal + tax).toFixed(2);
  }

  const documentDetailsSummary = (record) => {
    if (record.kind === 'sale') return record.details || '';
    const data = readDocumentDetails(record);
    if (data.lines?.length) return data.lines.map((line) => line.item).filter(Boolean).join(', ');
    return record.details || '';
  };

  const renderCustomers = () => {
    customerRows.replaceChildren();
    if (!customers.length) {
      addCell(customerRows.insertRow(), 'No customers saved yet.').colSpan = 3;
    }
    for (const customer of customers) {
      const row = customerRows.insertRow();
      addCell(row, customer.name);
      addCell(row, [customer.email, customer.phone].filter(Boolean).join(' · '));
      addCell(row, customer.company);
    }
    customerSelect.replaceChildren();
    const unlinked = document.createElement('option');
    unlinked.value = '';
    unlinked.textContent = 'No customer linked';
    customerSelect.append(unlinked);
    for (const customer of customers) {
      const option = document.createElement('option');
      option.value = customer.id;
      option.textContent = customer.name;
      customerSelect.append(option);
    }
    document.querySelector('#customer-total').textContent = String(customers.length);
  };

  const renderRecords = () => {
    recordRows.replaceChildren();
    if (!records.length) {
      addCell(recordRows.insertRow(), 'No business records saved yet.').colSpan = 7;
    }
    for (const record of records) {
      const row = recordRows.insertRow();
      const first = document.createElement('td');
      const kind = document.createElement('strong');
      kind.textContent = record.kind.toUpperCase();
      const title = document.createElement('div');
      title.textContent = record.title;
      const ref = document.createElement('small');
      ref.textContent = record.reference || 'No reference number';
      first.append(kind, title, ref);
      row.append(first);
      addCell(row, record.customer_name || 'Unlinked');
      addCell(row, documentDetailsSummary(record));

      const statusCell = document.createElement('td');
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Status for ${record.title}`);
      for (const value of statuses[record.kind] || []) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value.replace(/\b\w/g, (character) => character.toUpperCase());
        select.append(option);
      }
      select.value = record.status;
      select.addEventListener('change', async () => {
        select.disabled = true;
        try {
          await api(`/api/admin/records/${encodeURIComponent(record.id)}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
          status.textContent = 'Record status updated.';
        } catch (error) {
          status.textContent = error.message;
          select.value = record.status;
        } finally {
          select.disabled = false;
        }
      });
      statusCell.append(select);
      row.append(statusCell);

      const amount = Number(record.amount_cents) / 100;
      addCell(row, new Intl.NumberFormat('en-ZA', { style: 'currency', currency: record.currency || 'ZAR' }).format(amount));
      addCell(row, [record.record_date, record.due_date ? `Due ${record.due_date}` : ''].filter(Boolean).join(' · '));
      const actions = document.createElement('td');
      if (record.kind === 'quote' || record.kind === 'invoice') {
        const print = document.createElement('button');
        print.className = 'admin-refresh';
        print.type = 'button';
        print.textContent = 'Print / PDF';
        print.setAttribute('aria-label', `Print or save ${record.kind}: ${record.title}`);
        print.addEventListener('click', () => printDocument(record));
        actions.append(print);
      }
      const remove = document.createElement('button');
      remove.className = 'admin-delete';
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete ${record.kind}: ${record.title}`);
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete “${record.title}”? This cannot be undone.`)) return;
        remove.disabled = true;
        try {
          await api(`/api/admin/records/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
          status.textContent = 'Record deleted.';
          await loadData();
        } catch (error) {
          status.textContent = error.message;
          remove.disabled = false;
        }
      });
      actions.append(remove);
      row.append(actions);
    }
    for (const kind of ['quote', 'sale', 'invoice']) {
      document.querySelector(`#${kind}-total`).textContent = String(records.filter((record) => record.kind === kind).length);
    }
  };

  const renderInquiries = () => {
    inquiryRows.replaceChildren();
    if (!inquiries.length) addCell(inquiryRows.insertRow(), 'No website inquiries saved yet.').colSpan = 6;
    for (const inquiry of inquiries) {
      const row = inquiryRows.insertRow();
      addCell(row, new Date(inquiry.created_at).toLocaleString());
      addCell(row, inquiry.source === 'product_quote' ? 'Product quote' : 'Contact message');
      addCell(row, [inquiry.name, inquiry.email, inquiry.phone].filter(Boolean).join(' · ') || 'WhatsApp contact');
      const description = [inquiry.topic, inquiry.message].filter(Boolean).join('\n');
      addCell(row, description);
      const state = document.createElement('td');
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Status for inquiry from ${inquiry.name || 'a website visitor'}`);
      for (const value of ['new', 'converted', 'closed']) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value[0].toUpperCase() + value.slice(1);
        select.append(option);
      }
      select.value = inquiry.status;
      select.addEventListener('change', async () => {
        select.disabled = true;
        try {
          await api(`/api/admin/inquiries/${encodeURIComponent(inquiry.id)}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) });
          status.textContent = 'Inquiry status updated.';
        } catch (error) {
          status.textContent = error.message;
          select.value = inquiry.status;
        } finally {
          select.disabled = false;
        }
      });
      state.append(select);
      row.append(state);
      const actions = document.createElement('td');
      const remove = document.createElement('button');
      remove.className = 'admin-delete';
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Delete this website inquiry? This cannot be undone.')) return;
        remove.disabled = true;
        try {
          await api(`/api/admin/inquiries/${encodeURIComponent(inquiry.id)}`, { method: 'DELETE' });
          status.textContent = 'Inquiry deleted.';
          await loadData();
        } catch (error) {
          status.textContent = error.message;
          remove.disabled = false;
        }
      });
      actions.append(remove);
      row.append(actions);
    }
    document.querySelector('#inquiry-total').textContent = String(inquiries.length);
  };

  async function loadData() {
    status.textContent = 'Loading business records…';
    try {
      const data = await api('/api/admin/data');
      customers = Array.isArray(data.customers) ? data.customers : [];
      records = Array.isArray(data.records) ? data.records : [];
      inquiries = Array.isArray(data.inquiries) ? data.inquiries : [];
      renderCustomers();
      renderRecords();
      renderInquiries();
      status.textContent = 'Business data loaded.';
    } catch (error) {
      status.textContent = error.message.includes('401') || error.message.toLowerCase().includes('sign in')
        ? 'Your dashboard session has ended. Sign in again to continue.'
        : error.message;
      if (error.message.includes('401')) showWorkspace(false);
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = loginForm.querySelector('[type="submit"]');
    const credentials = Object.fromEntries(new FormData(loginForm));
    submit.disabled = true;
    loginStatus.textContent = 'Sending your sign-in link…';
    try {
      const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(credentials) });
      loginForm.reset();
      loginStatus.textContent = result.message || 'If the address is authorized, a sign-in link will arrive shortly.';
    } catch (error) {
      loginStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector('#admin-logout').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST', body: '{}' });
    } finally {
      showWorkspace(false);
      loginForm.reset();
      loginStatus.textContent = 'You have signed out.';
    }
  });

  document.querySelectorAll('[data-admin-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.adminAction;
      if (action === 'clients') {
        document.querySelector('#customer-form-title').closest('.admin-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        customerForm.elements.name.focus({ preventScroll: true });
        return;
      }
      if (action === 'quote' || action === 'invoice') {
        kindSelect.value = action;
        updateStatusOptions();
        recordForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        recordForm.elements.title.focus({ preventScroll: true });
      }
    });
  });

  customerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = customerForm.querySelector('[type="submit"]');
    submit.disabled = true;
    const data = Object.fromEntries(new FormData(customerForm));
    try {
      await api('/api/admin/customers', { method: 'POST', body: JSON.stringify(data) });
      customerForm.reset();
      status.textContent = 'Customer saved.';
      await loadData();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  recordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = recordForm.querySelector('[type="submit"]');
    submit.disabled = true;
    const data = Object.fromEntries(new FormData(recordForm));
    if (kindSelect.value === 'quote' || kindSelect.value === 'invoice') {
      const lines = getDocumentLines();
      const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
      const taxRate = Number(recordForm.elements.taxRate.value) || 0;
      const total = subtotal + subtotal * taxRate / 100;
      data.amount = total.toFixed(2);
      data.details = JSON.stringify({
        template: 'solv-it-a4-v1',
        referencePo: recordForm.elements.referencePo.value.trim(),
        billingAddress: recordForm.elements.billingAddress.value.trim(),
        taxRate,
        notes: recordForm.elements.documentNotes.value.trim(),
        lines,
      });
    }
    try {
      await api('/api/admin/records', { method: 'POST', body: JSON.stringify(data) });
      recordForm.reset();
      recordForm.elements.date.value = today();
      documentLines.replaceChildren();
      updateStatusOptions();
      status.textContent = 'Business record saved.';
      await loadData();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  kindSelect.addEventListener('change', () => updateStatusOptions());
  document.querySelector('#add-document-line').addEventListener('click', addDocumentLine);
  recordForm.elements.taxRate.addEventListener('input', updateDocumentTotals);
  document.querySelector('#admin-refresh').addEventListener('click', loadData);
  document.querySelector('#admin-export').addEventListener('click', () => {
    const backup = { exportedAt: new Date().toISOString(), customers, records, inquiries };
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const download = document.createElement('a');
    download.href = URL.createObjectURL(file);
    download.download = `compusoft-business-backup-${new Date().toISOString().slice(0, 10)}.json`;
    download.click();
    URL.revokeObjectURL(download.href);
    status.textContent = 'A JSON backup was downloaded to this device.';
  });
  async function initialize() {
    try {
      const result = await api('/api/admin/auth');
      showWorkspace(Boolean(result.authenticated));
      if (result.authenticated) await loadData();
    } catch (error) {
      showWorkspace(false);
      loginStatus.textContent = error.message;
    }
  }

  updateStatusOptions();
  if (!recordForm.elements.date.value) recordForm.elements.date.value = today();
  initialize();
})();
