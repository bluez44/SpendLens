import { act, renderHook } from '@testing-library/react-native';

import type { Subscription } from './subscriptions';
import { useSubscriptionFormState } from './use-subscription-form-state';

describe('useSubscriptionFormState', () => {
  it('initialises to defaults', async () => {
    const { result } = await renderHook(() => useSubscriptionFormState('VND'));
    const s = result.current;
    expect(s.editingId).toBeUndefined();
    expect(s.isPaused).toBe(false);
    expect(s.name).toBe('');
    expect(s.currency).toBe('VND');
    expect(s.amountDigits).toBe('');
    expect(s.category).toBe('other');
    expect(s.anchorDay).toBe(1);
    expect(s.photoPath).toBeNull();
    expect(s.notify7).toBe(false);
    expect(s.notify3).toBe(false);
    expect(s.notify1).toBe(false);
    expect(s.customInput).toBe('');
  });

  it('setters keep the mirrored refs in sync', async () => {
    const { result } = await renderHook(() => useSubscriptionFormState('USD'));
    await act(async () => {
      result.current.setName('Netflix');
      result.current.setAmountDigits('1299');
      result.current.setNotify7(true);
    });
    const s = result.current;
    expect(s.name).toBe('Netflix');
    expect(s.refs.name.current).toBe('Netflix');
    expect(s.amountDigits).toBe('1299');
    expect(s.refs.amountDigits.current).toBe('1299');
    expect(s.notify7).toBe(true);
    expect(s.refs.notify7.current).toBe(true);
  });

  it('loadFromSubscription hydrates every field including VND digits (decimals=0)', async () => {
    const sub: Subscription = {
      id: 7, uuid: 'u', name: 'Spotify',
      category: 'fun', originalAmount: 59000, originalCurrency: 'VND',
      anchorDay: 12, nextDueDate: '2026-09-12',
      photoPath: '/tmp/x.jpg',
      notify7: true, notify3: false, notify1: true,
      paused: true, createdAt: 0, updatedAt: 0,
    };
    const { result } = await renderHook(() => useSubscriptionFormState('USD'));
    await act(async () => result.current.loadFromSubscription(sub));
    const s = result.current;
    expect(s.editingId).toBe(7);
    expect(s.isPaused).toBe(true);
    expect(s.name).toBe('Spotify');
    expect(s.currency).toBe('VND');
    expect(s.amountDigits).toBe('59000');
    expect(s.category).toBe('fun');
    expect(s.anchorDay).toBe(12);
    expect(s.photoPath).toBe('/tmp/x.jpg');
    expect(s.notify7).toBe(true);
    expect(s.notify3).toBe(false);
    expect(s.notify1).toBe(true);
    expect(s.refs.editingId.current).toBe(7);
    expect(s.refs.amountDigits.current).toBe('59000');
  });

  it('loadFromSubscription converts USD amount to cents (decimals=2)', async () => {
    const sub: Subscription = {
      id: 3, uuid: 'u', name: 'iCloud',
      category: 'bills', originalAmount: 2.99, originalCurrency: 'USD',
      anchorDay: 1, nextDueDate: '2026-09-01',
      photoPath: null,
      notify7: false, notify3: false, notify1: false,
      paused: false, createdAt: 0, updatedAt: 0,
    };
    const { result } = await renderHook(() => useSubscriptionFormState('VND'));
    await act(async () => result.current.loadFromSubscription(sub));
    expect(result.current.amountDigits).toBe('299');
  });

  it('resetToDefaults clears everything back to defaults and honours the primary currency', async () => {
    const { result } = await renderHook(() => useSubscriptionFormState('EUR'));
    await act(async () => {
      result.current.setName('X');
      result.current.setAmountDigits('123');
      result.current.setCurrency('VND');
      result.current.setNotify3(true);
      result.current.setCustomInput('mycat');
    });
    await act(async () => result.current.resetToDefaults());
    const s = result.current;
    expect(s.name).toBe('');
    expect(s.amountDigits).toBe('');
    expect(s.currency).toBe('EUR');
    expect(s.notify3).toBe(false);
    expect(s.customInput).toBe('');
    expect(s.refs.name.current).toBe('');
  });
});
