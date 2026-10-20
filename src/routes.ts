export interface NavItem {
  path: string;
  label: string;
  adminOnly: boolean;
}

/** Authenticated routes in menu order. /login is public and is not listed. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/new', label: 'New', adminOnly: false },
  { path: '/found', label: 'Found', adminOnly: false },
  { path: '/applied', label: 'Applied', adminOnly: false },
  { path: '/profile', label: 'Profile', adminOnly: false },
  { path: '/documents', label: 'Documents', adminOnly: false },
  { path: '/account', label: 'Account', adminOnly: false },
  { path: '/admin', label: 'Admin', adminOnly: true },
];
