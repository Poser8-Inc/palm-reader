import type { CustomerInfo } from 'react-native-purchases';

export const SUITE_ENTITLEMENT_KEY = 'apprentice_suite';
export const LEGACY_ENTITLEMENT_KEY = 'premium';

export function hasSuiteEntitlement(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active[SUITE_ENTITLEMENT_KEY]);
}

export function hasPremiumAccess(customerInfo: CustomerInfo): boolean {
  const active = customerInfo.entitlements.active;
  return Boolean(active[SUITE_ENTITLEMENT_KEY] || active[LEGACY_ENTITLEMENT_KEY]);
}
