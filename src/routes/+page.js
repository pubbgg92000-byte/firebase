// Disable SSR — this is a purely client-side Firebase dashboard.
// SSR fails because the page uses browser APIs (localStorage, fetch, etc.)
// and all state is fetched dynamically from Firebase on mount.
export const ssr = false;
export const prerender = false;
