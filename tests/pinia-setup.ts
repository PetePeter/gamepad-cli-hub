/**
 * Global test setup — initialises Pinia before each test so that store
 * access from reactive state shims (and future Vue component tests) works.
 */

import { beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

beforeEach(() => {
  setActivePinia(createPinia());
});
