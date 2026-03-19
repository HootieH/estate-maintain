const API = {
  token: localStorage.getItem('token'),

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) {
      this.logout();
      return;
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      throw new Error('Invalid response from server');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  delete(path) { return this.request('DELETE', path); },

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  },

  setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  },

  logout() {
    this.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.hash = '#/login';
    location.reload();
  }
};
