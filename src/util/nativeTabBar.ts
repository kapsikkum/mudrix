import { useEffect, useState, type RefObject } from 'react';
import { callNative, isNativeApp } from './nativeApp';

const OVERLAY = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"]';

interface NativeTab {
  id: string;
  label: string;
  active: boolean;
  badge: string | null;
  call: boolean;
}

function isIosApp(): boolean {
  return isNativeApp() && window.Capacitor?.getPlatform?.() === 'ios';
}

export function useNativeTabBar(ref: RefObject<HTMLElement | null>): boolean {
  const enabled = isIosApp();
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    const bar = ref.current;
    if (!enabled || !bar) return;
    let frame = 0;
    let last = '';

    const publish = () => {
      frame = 0;
      const visible = !document.querySelector(OVERLAY);
      const tabs: NativeTab[] = Array.from(
        bar.querySelectorAll<HTMLElement>('[data-native-tab]')
      ).map((el) => ({
        id: el.dataset.nativeTab ?? '',
        label: el.textContent?.trim() ?? '',
        active: el.getAttribute('aria-current') === 'page',
        badge: el.dataset.badge ?? null,
        call: el.dataset.call === 'true',
      }));
      const json = JSON.stringify({ visible, tabs });
      if (json === last) return;
      last = json;
      setCovered(visible);
      if (visible) document.documentElement.dataset.nativeTabbar = 'true';
      else delete document.documentElement.dataset.nativeTabbar;
      callNative('setTabBar', { visible, tabs }).catch(() => {});
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(publish);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-current', 'data-badge', 'data-call', 'role'],
    });
    schedule();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      setCovered(false);
      delete document.documentElement.dataset.nativeTabbar;
      callNative('setTabBar', { visible: false, tabs: [] }).catch(() => {});
    };
  }, [enabled, ref]);

  useEffect(() => {
    if (!enabled) return;
    const subscription = window.Capacitor?.addListener?.<{ id?: string }>(
      'WizardChat',
      'tabBarTap',
      (data) => {
        if (!data?.id) return;
        ref.current
          ?.querySelector<HTMLElement>(`[data-native-tab="${CSS.escape(data.id)}"]`)
          ?.click();
      }
    ) as { remove?: () => void } | undefined;
    return () => subscription?.remove?.();
  }, [enabled, ref]);

  return enabled && covered;
}
