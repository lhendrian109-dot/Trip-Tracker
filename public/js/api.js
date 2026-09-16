const API = {
  async _req(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  },

  meta: () => API._req('GET', '/api/meta'),

  trips: {
    list: () => API._req('GET', '/api/trips'),
    create: (data) => API._req('POST', '/api/trips', data),
    update: (id, data) => API._req('PUT', `/api/trips/${id}`, data),
    remove: (id) => API._req('DELETE', `/api/trips/${id}`),
    check: (id) => API._req('POST', `/api/trips/${id}/check`),
  },

  wishlist: {
    list: () => API._req('GET', '/api/wishlist'),
    create: (data) => API._req('POST', '/api/wishlist', data),
    update: (id, data) => API._req('PUT', `/api/wishlist/${id}`, data),
    remove: (id) => API._req('DELETE', `/api/wishlist/${id}`),
    check: (id) => API._req('POST', `/api/wishlist/${id}/check`),
  },
};
