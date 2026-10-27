(() => {
  const status = document.querySelector('#admin-status');
  const customerForm = document.querySelector('#customer-form');
  const recordForm = document.querySelector('#record-form');
  const customerRows = document.querySelector('#customer-rows');
  const recordRows = document.querySelector('#record-rows');
  const inquiryRows = document.querySelector('#inquiry-rows');
  const customerSelect = document.querySelector('#record-customer');
  const kindSelect = recordForm.elements.kind;
  const recordStatus = recordForm.elements.status;
  const statuses = {
    quote: ['draft', 'sent', 'accepted', 'declined', 'expired'],
    sale: ['pending', 'complete', 'refunded'],
    invoice: ['draft', 'sent', 'partially paid', 'paid', 'overdue', 'cancelled'],
  };
  let customers = [];
  let records = [];
  let inquiries = [];

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
      addCell(row, record.details);

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
        ? 'Sign in through Cloudflare Access with your authorized owner account, then refresh this page.'
        : error.message;
    }
  }

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
    try {
      await api('/api/admin/records', { method: 'POST', body: JSON.stringify(data) });
      recordForm.reset();
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
  updateStatusOptions();
  loadData();
})();
