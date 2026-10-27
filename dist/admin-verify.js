(() => {
  const status = document.querySelector('#admin-verify-status');
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  window.history.replaceState(null, '', window.location.pathname);

  if (!token) {
    status.textContent = 'This sign-in link is invalid or has expired. Return to the owner login page to request another link.';
    return;
  }

  fetch('/api/admin/redeem', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'This sign-in link could not be verified.');
      window.location.replace('/admin.html');
    })
    .catch((error) => {
      status.textContent = `${error.message} Return to the owner login page to request another link.`;
    });
})();
