(() => {
  document.documentElement.classList.add('js');

  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);

  const cursorAura = document.createElement('div');
  cursorAura.className = 'cursor-aura';
  cursorAura.setAttribute('aria-hidden', 'true');
  cursorAura.innerHTML = '<span class="aura-halo"></span><span class="aura-core"></span><span class="aura-label">SIGNAL / IDLE</span>';
  document.body.append(cursorAura);

  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (supportsHover.matches && !prefersReducedMotion.matches) {
    let idleTimer;
    const clearIdle = () => {
      window.clearTimeout(idleTimer);
      cursorAura.classList.remove('is-idle');
      document.body.classList.remove('cursor-idle');
    };
    const scheduleIdle = (event) => {
      cursorAura.style.setProperty('--pointer-x', `${event.clientX}px`);
      cursorAura.style.setProperty('--pointer-y', `${event.clientY}px`);
      cursorAura.classList.add('is-visible');
      clearIdle();
      idleTimer = window.setTimeout(() => {
        cursorAura.classList.add('is-idle');
        document.body.classList.add('cursor-idle');
      }, 1250);
    };
    window.addEventListener('pointermove', scheduleIdle, { passive: true });
    window.addEventListener('pointerdown', scheduleIdle, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => {
      clearIdle();
      cursorAura.classList.remove('is-visible');
    });
  }

  const update = () => {
    const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${pageHeight > 0 ? window.scrollY / pageHeight : 0})`;
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();

  const visitorCount = document.querySelector('[data-visitor-count]');
  if (visitorCount) {
    fetch('https://counterapi.com/api/solv-it.com/view/site-total-unique?unique=true', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Number.isSafeInteger(data?.value) && data.value >= 0) {
          visitorCount.textContent = data.value.toLocaleString();
        }
      })
      .catch(() => {});
  }

  const revealItems = document.querySelectorAll('.page-intro, .home-intro, .services-preview, .feature, .content-card, .contact-direct, .price-list, .pricing-note, .pricing-actions, .hero-copy, .hero-visual, .service-section, .split-section, .process-v2, .final-cta');
  revealItems.forEach((item, index) => {
    item.classList.add('reveal');
    item.style.setProperty('--reveal-delay', `${Math.min(index * 55, 330)}ms`);
  });

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -36px' });
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }
})();

(() => {
  const categorySelect = document.querySelector('#quote-category');
  const productSelect = document.querySelector('#quote-product');
  if (!categorySelect || !productSelect) return;

  const categories = {
    computers: { label: 'COMPUTERS', image: 'assets/products/laptop.png', description: 'Laptops, desktops, gaming PCs, and workstations.' , products: ['Laptops', 'Desktops & PCs', 'Gaming PCs', 'Workstations'] },
    components: { label: 'COMPONENTS & UPGRADES', image: 'assets/products/components.png', description: 'Parts and upgrades selected around your system and budget.', products: ['Graphics cards', 'RAM', 'SSD and storage', 'Power supplies', 'Cooling components'] },
    networking: { label: 'NETWORKING', image: 'assets/products/networking.png', description: 'Routers, mesh Wi-Fi, and network equipment for your space.', products: ['Wi-Fi routers', 'Mesh Wi-Fi systems', 'Network switches', 'Access points', 'Network adapters'] },
    office: { label: 'OFFICE & ACCESSORIES', image: 'assets/products/monitor.png', description: 'Monitors, printers, peripherals, and backup power.', products: ['Monitors', 'Keyboards and mice', 'Printers', 'Webcams and headsets', 'UPS backup power'] },
  };
  const quantityInput = document.querySelector('#quote-quantity');
  const itemNotes = document.querySelector('#quote-item-notes');
  const generalNotes = document.querySelector('#quote-notes');
  const addButton = document.querySelector('#quote-add');
  const clearButton = document.querySelector('#quote-clear');
  const list = document.querySelector('#quote-items');
  const count = document.querySelector('#quote-count');
  const status = document.querySelector('#quote-status');
  const requestButton = document.querySelector('#request-quote');
  const previewImage = document.querySelector('#quote-product-image');
  const previewPlaceholder = document.querySelector('#quote-preview-placeholder');
  const previewCategory = document.querySelector('#quote-preview-category');
  const previewCopy = document.querySelector('#quote-product-copy');
  const quoteItems = [];

  const updatePreview = () => {
    const category = categories[categorySelect.value];
    const name = productSelect.value;
    if (!category) {
      previewImage.hidden = true;
      previewPlaceholder.hidden = false;
      previewCategory.textContent = 'SUPPLIER SOURCED';
      previewCopy.textContent = 'Choose a category and product to see the selected group here.';
      return;
    }
    previewImage.src = category.image;
    previewImage.alt = `Example ${category.label.toLowerCase()} item`;
    previewImage.hidden = false;
    previewPlaceholder.hidden = true;
    previewCategory.textContent = category.label;
    previewCopy.textContent = name ? `${name}. ${category.description}` : category.description;
  };

  categorySelect.addEventListener('change', () => {
    const category = categories[categorySelect.value];
    productSelect.replaceChildren(new Option(category ? 'Select a product type' : 'Choose a category first', ''));
    (category?.products || []).forEach((name) => productSelect.add(new Option(name, name)));
    productSelect.disabled = !category;
    updatePreview();
  });
  productSelect.addEventListener('change', updatePreview);

  const render = () => {
    list.replaceChildren();
    if (!quoteItems.length) {
      const empty = document.createElement('li');
      empty.className = 'quote-empty';
      empty.textContent = 'Your list is empty. Select an item to get started.';
      list.append(empty);
    }

    let total = 0;
    quoteItems.forEach((item, index) => {
      total += item.quantity;
      const row = document.createElement('li');
      row.className = 'quote-item';
      const info = document.createElement('div');
      info.className = 'quote-item-info';
      const label = document.createElement('strong');
      label.textContent = `${item.quantity} x ${item.name}`;
      info.append(label);
      if (item.details) {
        const detail = document.createElement('small');
        detail.textContent = item.details;
        info.append(detail);
      }
      const controls = document.createElement('div');
      controls.className = 'quote-item-controls';
      const quantity = document.createElement('input');
      quantity.type = 'number';
      quantity.min = '1';
      quantity.max = '20';
      quantity.value = item.quantity;
      quantity.className = 'quote-line-quantity';
      quantity.dataset.index = index;
      quantity.setAttribute('aria-label', `Quantity of ${item.name}`);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'quote-remove';
      remove.dataset.index = index;
      remove.setAttribute('aria-label', `Remove ${item.name} from quote list`);
      remove.textContent = 'Remove';
      controls.append(quantity, remove);
      row.append(info, controls);
      list.append(row);
    });
    count.textContent = total;
    clearButton.hidden = quoteItems.length === 0;
  };

  addButton.addEventListener('click', () => {
    const name = productSelect.value;
    const quantity = Number(quantityInput.value);
    const details = itemNotes.value.trim();
    if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      status.textContent = 'Choose a product and enter a quantity from 1 to 20.';
      return;
    }
    const existing = quoteItems.find((item) => item.name === name && item.details === details);
    if (existing) existing.quantity = Math.min(20, existing.quantity + quantity);
    else quoteItems.push({ name, quantity, details });
    status.textContent = `${name} added to your quote list.`;
    quantityInput.value = '1';
    itemNotes.value = '';
    productSelect.selectedIndex = 0;
    updatePreview();
    render();
  });

  list.addEventListener('change', (event) => {
    const input = event.target.closest('.quote-line-quantity');
    if (!input) return;
    const quantity = Number(input.value);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      status.textContent = 'Enter a quantity from 1 to 20.';
      input.value = quoteItems[Number(input.dataset.index)].quantity;
      return;
    }
    quoteItems[Number(input.dataset.index)].quantity = quantity;
    status.textContent = 'Quote list updated.';
    render();
  });

  list.addEventListener('click', (event) => {
    const remove = event.target.closest('.quote-remove');
    if (!remove) return;
    const [removed] = quoteItems.splice(Number(remove.dataset.index), 1);
    status.textContent = `${removed.name} removed from your quote list.`;
    render();
  });
  clearButton.addEventListener('click', () => {
    quoteItems.length = 0;
    status.textContent = 'Your quote list has been cleared.';
    render();
  });

  requestButton.addEventListener('click', () => {
    if (!quoteItems.length) {
      status.textContent = 'Add at least one item to your quote list first.';
      return;
    }
    const message = [
      'Hi CompuSoft, please quote these items:',
      ...quoteItems.map((item) => `- ${item.quantity} x ${item.name}${item.details ? ` (${item.details})` : ''}`),
      generalNotes.value.trim() ? `Additional notes: ${generalNotes.value.trim()}` : '',
      'Please confirm exact models, availability, prices, and delivery.',
    ].filter(Boolean).join('\n');
    window.open(`https://wa.me/27820593491?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    requestButton.disabled = true;
    status.textContent = 'Saving your quote request…';
    fetch('/api/quote-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: quoteItems, notes: generalNotes.value.trim() }),
      keepalive: true,
    }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The request was not saved. Please continue in WhatsApp.');
      status.textContent = 'Quote request saved. Finish sending it in WhatsApp so CompuSoft can follow up.';
    }).catch((error) => {
      status.textContent = `${error.message} Your WhatsApp message is open.`;
    }).finally(() => {
      requestButton.disabled = false;
    });
  });

  updatePreview();
  render();
})();
