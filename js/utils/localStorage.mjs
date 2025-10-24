export const ls = {
  get(k) {
    return localStorage.getItem(k);
  },
  set(k, v) {
    localStorage.setItem(k, v);
  },
};
