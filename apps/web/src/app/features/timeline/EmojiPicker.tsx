import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { computePosition, autoUpdate, flip, shift, offset } from '@floating-ui/dom';
import {
  SmileyIcon,
  UserIcon,
  PawPrintIcon,
  ForkKnifeIcon,
  AirplaneIcon,
  SoccerBallIcon,
  LightbulbIcon,
  HeartIcon,
  FlagIcon,
  ClockIcon,
  StickerIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { emojiPickerAtom, emojiStyleAtom } from '@/app/store/atoms';
import { getMaxEmojiVersion } from '@/util/emojiStyle';
import { useRecentEmoji } from '@/app/hooks/useRecentEmoji';
import { contextMenuAtom } from '@/app/features/contextMenu/contextMenuAtom';
import { useCoarsePointer } from '@/app/hooks/useCoarsePointer';
import { useImagePacks } from '@/app/hooks/useImagePacks';
import { useDelayedFlag } from '@/app/hooks/useDelayedFlag';
import { useBackToClose } from '@/app/hooks/useBackToClose';
import { useOutsideDismiss, usePickerDrawer } from '@/app/hooks/usePickerShell';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { Tooltip } from '@/app/components/Tooltip';
import { PickerPreviewBar, type PreviewItem } from '@/app/components/PickerPreviewBar';
import {
  getAllCategories,
  isEmojiVersionSupported,
  searchEmoji,
  emojiToShortcode,
  type EmojiCategory,
  type EmojiItem,
  type CustomEmojiItem,
  type CustomPackCategory,
} from './emojiData';
import * as css from './EmojiPicker.css';

const PICKER_WIDTH = 352;
const PICKER_HEIGHT = 460;

function rectOf(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

interface RecentEntry {
  emoji: string;
  label: string;
  url?: string;
}

const EMOJI_NAV_ICONS: Record<string, React.ReactNode> = {
  'smileys-emotion': <SmileyIcon size={16} />,
  'people-body': <UserIcon size={16} />,
  'animals-nature': <PawPrintIcon size={16} />,
  'food-drink': <ForkKnifeIcon size={16} />,
  'travel-places': <AirplaneIcon size={16} />,
  activities: <SoccerBallIcon size={16} />,
  objects: <LightbulbIcon size={16} />,
  symbols: <HeartIcon size={16} />,
  flags: <FlagIcon size={16} />,
};

const RECENT_ID = 'recent';

interface EmojiPickerProps {
  embedded?: boolean;
  naked?: boolean;
  client?: MatrixClient;
  roomId?: string;
  onPick?: (emoji: string, mxcUrl?: string) => void;
  onClose?: () => void;
}

export function EmojiPicker({
  embedded,
  naked,
  client: propClient,
  roomId: propRoomId,
  onPick: propOnPick,
  onClose: propOnClose,
}: EmojiPickerProps) {
  const { t } = useTranslation();
  const [picker, setPicker] = useAtom(emojiPickerAtom);
  const setContextMenu = useSetAtom(contextMenuAtom);
  const [searchQuery, setSearchQuery] = useState('');

  const [preview, setPreview] = useState<PreviewItem | null>(null);

  const previewEmoji = useCallback((item: EmojiItem) => {
    setPreview({
      kind: 'emoji',
      emoji: item.emoji,
      shortcode: emojiToShortcode(item.emoji) ?? `:${item.label}:`,
    });
  }, []);

  const previewCustom = useCallback((item: CustomEmojiItem) => {
    setPreview({ kind: 'image', url: item.url, shortcode: `:${item.shortcode}:` });
  }, []);

  const previewRecent = useCallback((entry: RecentEntry) => {
    setPreview(
      entry.url
        ? { kind: 'image', url: entry.url, shortcode: entry.emoji }
        : {
            kind: 'emoji',
            emoji: entry.emoji,
            shortcode: emojiToShortcode(entry.emoji) ?? `:${entry.label}:`,
          }
    );
  }, []);

  const ctx = useMemo(
    () =>
      embedded
        ? propClient && propRoomId && propOnPick && propOnClose
          ? { client: propClient, roomId: propRoomId, onPick: propOnPick, onClose: propOnClose }
          : null
        : picker,
    [embedded, propClient, propRoomId, propOnPick, propOnClose, picker]
  );

  const { recent, saveRecent: saveRecentEmoji } = useRecentEmoji(ctx?.client ?? null);

  const coarse = useCoarsePointer();

  const close = useCallback(() => {
    if (embedded) {
      propOnClose?.();
    } else {
      setPicker(null);
      setContextMenu(null);
    }
  }, [embedded, propOnClose, setPicker, setContextMenu]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeNav, setActiveNav] = useState<string>(RECENT_ID);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawer = usePickerDrawer(wrapRef, close, !embedded && !naked && !!picker);
  useOutsideDismiss(wrapRef, close, !!ctx && !naked);

  const emojiStyle = useAtomValue(emojiStyleAtom);
  const maxEmojiVersion = getMaxEmojiVersion(emojiStyle);
  const recentEmojis = useMemo(() => {
    if (searchQuery) return [];
    return recent.filter((r) => r.url || isEmojiVersionSupported(r.emoji, maxEmojiVersion));
  }, [recent, searchQuery, maxEmojiVersion]);

  const { packs: imagePacks, loading: packsLoading } = useImagePacks(
    ctx?.client ?? null,
    ctx?.roomId ?? null
  );
  const showPacksSkeleton = useDelayedFlag(packsLoading, 300);

  const categories = useMemo(() => {
    if (!ctx) return [];
    return getAllCategories(imagePacks, maxEmojiVersion);
  }, [ctx, imagePacks, maxEmojiVersion]);

  const filteredCategories = useMemo(
    () => searchEmoji(searchQuery, categories),
    [searchQuery, categories]
  );

  const firstPreview = useMemo<PreviewItem | null>(() => {
    const recentEntry = recentEmojis[0];
    if (recentEntry) {
      return recentEntry.url
        ? {
            kind: 'image',
            url: recentEntry.url,
            shortcode: recentEntry.emoji,
            label: recentEntry.label,
          }
        : {
            kind: 'emoji',
            emoji: recentEntry.emoji,
            shortcode: emojiToShortcode(recentEntry.emoji) ?? `:${recentEntry.label}:`,
          };
    }
    for (const cat of filteredCategories) {
      if (cat.emojis.length === 0) continue;
      if (cat.type === 'pack') {
        const e = (cat as CustomPackCategory).emojis[0];
        return { kind: 'image', url: e.url, shortcode: `:${e.shortcode}:`, label: e.label };
      }
      const e = (cat as EmojiCategory).emojis[0];
      return {
        kind: 'emoji',
        emoji: e.emoji,
        shortcode: emojiToShortcode(e.emoji) ?? `:${e.label}:`,
      };
    }
    return null;
  }, [recentEmojis, filteredCategories]);

  useEffect(() => {
    setPreview(null);
  }, [searchQuery]);

  useEffect(() => {
    if (ctx && !coarse) {
      searchRef.current?.focus();
    }
  }, [ctx, coarse]);

  useEffect(() => {
    if (!bodyRef.current || searchQuery) return;
    const catIds = [...sectionRefs.current.keys()];
    if (catIds.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best = '';
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            best = entry.target.getAttribute('data-cat-id') ?? '';
            bestRatio = entry.intersectionRatio;
          }
        }
        if (best) setActiveNav(best);
      },
      { root: bodyRef.current, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    const els: Element[] = [];
    sectionRefs.current.forEach((el) => {
      observer.observe(el);
      els.push(el);
    });
    return () => {
      els.forEach((el) => observer.unobserve(el));
    };
  }, [filteredCategories, searchQuery, recent]);

  const handleNavClick = useCallback((catId: string) => {
    setActiveNav(catId);
    const el = sectionRefs.current.get(catId);
    if (el) {
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, []);

  // The composer's picker on a phone is docked under the message box and stays open so several
  // emoji can go in; it is closed with its X, a drag down, the emoji button or Back.
  const stayOpen = !!embedded && drawer;

  const handleEmojiClick = useCallback(
    (item: EmojiItem, keepOpen = false) => {
      if (!ctx) return;
      saveRecentEmoji(item.emoji, item.label);
      ctx.onPick(item.emoji);
      if (!keepOpen && !stayOpen) close();
    },
    [ctx, close, saveRecentEmoji, stayOpen]
  );

  const handleCustomPick = useCallback(
    (emoji: CustomEmojiItem, keepOpen = false) => {
      if (!ctx) return;
      saveRecentEmoji(`:${emoji.shortcode}:`, emoji.shortcode, emoji.url);
      ctx.onPick(`:${emoji.shortcode}:`, emoji.url);
      if (!keepOpen && !stayOpen) close();
    },
    [ctx, close, saveRecentEmoji, stayOpen]
  );

  const handleRecentPick = useCallback(
    (entry: RecentEntry, keepOpen = false) => {
      if (!ctx) return;
      saveRecentEmoji(entry.emoji, entry.label, entry.url);
      ctx.onPick(entry.emoji, entry.url);
      if (!keepOpen && !stayOpen) close();
    },
    [ctx, close, saveRecentEmoji, stayOpen]
  );

  const sectionRefCb = useCallback(
    (catId: string) => (el: HTMLDivElement | null) => {
      if (el) sectionRefs.current.set(catId, el);
      else sectionRefs.current.delete(catId);
    },
    []
  );

  const hasResults =
    recentEmojis.length > 0 || filteredCategories.some((cat) => cat.emojis.length > 0);

  useEffect(() => {
    if (embedded || naked || !picker) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const anchor = picker.anchor;
    const anchorRect = picker.anchorRect;
    if (!anchor && !anchorRect) {
      wrap.style.left = `${Math.max(8, window.innerWidth / 2 - PICKER_WIDTH / 2)}px`;
      wrap.style.top = `${Math.max(8, window.innerHeight / 2 - PICKER_HEIGHT / 2)}px`;
      return;
    }
    const reference: Parameters<typeof computePosition>[0] = {
      contextElement: anchor && anchor.isConnected ? anchor : document.body,
      getBoundingClientRect: () => {
        const r = anchorRect ?? (anchor ? rectOf(anchor) : null);
        return r
          ? {
              x: r.x,
              y: r.y,
              top: r.y,
              left: r.x,
              right: r.x + r.width,
              bottom: r.y + r.height,
              width: r.width,
              height: r.height,
            }
          : { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
      },
    };
    const placement = anchor?.closest('[role="menu"]') ? 'right-start' : 'bottom-start';
    return autoUpdate(reference, wrap, () => {
      const w = wrapRef.current;
      if (!w) return;
      computePosition(reference, w, {
        placement,
        strategy: 'fixed',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        if (!wrapRef.current) return;
        wrapRef.current.style.left = `${x}px`;
        wrapRef.current.style.top = `${y}px`;
      });
    });
  }, [embedded, naked, picker]);

  useBackToClose(!embedded && !naked && !!picker && drawer, close);

  if (!ctx) return null;

  const emojiContent = (
    <>
      {!searchQuery && recentEmojis.length > 0 && (
        <div ref={sectionRefCb(RECENT_ID)} data-cat-id={RECENT_ID} className={css.section}>
          <div className={css.sectionHeader}>{t('composer.recentEmoji')}</div>
          <div className={css.grid}>
            {recentEmojis.map((entry) => (
              <button
                key={entry.emoji}
                type="button"
                className={css.emojiItem}
                onMouseEnter={() => previewRecent(entry)}
                onClick={(e) => handleRecentPick(entry, e.shiftKey)}
              >
                {entry.url ? (
                  <AuthMediaImg
                    client={ctx.client}
                    mxcUrl={entry.url}
                    alt={entry.label}
                    className={css.emojiImg}
                  />
                ) : (
                  entry.emoji
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {showPacksSkeleton && (
        <div className={css.section} aria-busy="true" aria-label={t('common.loading')}>
          <div className={css.sectionHeader}>
            <div className={css.skeletonLabel} />
          </div>
          <div className={css.grid}>
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className={css.skeletonTile} />
            ))}
          </div>
        </div>
      )}

      {filteredCategories.map((cat) => {
        if (cat.emojis.length === 0) return null;

        if (cat.type === 'pack') {
          const packCat = cat as CustomPackCategory;
          return (
            <div
              key={cat.id}
              ref={sectionRefCb(cat.id)}
              data-cat-id={cat.id}
              className={css.section}
            >
              <div className={css.sectionHeader}>{cat.label}</div>
              <div className={css.grid}>
                {packCat.emojis.map((emo) => (
                  <button
                    key={emo.shortcode}
                    type="button"
                    className={css.emojiItem}
                    onMouseEnter={() => previewCustom(emo)}
                    onClick={(e) => handleCustomPick(emo, e.shiftKey)}
                  >
                    <AuthMediaImg
                      client={ctx.client}
                      mxcUrl={emo.url}
                      alt={emo.shortcode}
                      className={css.emojiImg}
                    />
                  </button>
                ))}
              </div>
            </div>
          );
        }

        const emojiCat = cat as EmojiCategory;
        return (
          <div key={cat.id} ref={sectionRefCb(cat.id)} data-cat-id={cat.id} className={css.section}>
            <div className={css.sectionHeader}>{cat.label}</div>
            <div className={css.grid}>
              {emojiCat.emojis.map((emoji) => (
                <button
                  key={emoji.hexcode}
                  type="button"
                  className={css.emojiItem}
                  onMouseEnter={() => previewEmoji(emoji)}
                  onClick={(e) => handleEmojiClick(emoji, e.shiftKey)}
                >
                  {emoji.emoji}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!hasResults && !packsLoading && (
        <div className={css.noResults}>{t('composer.noEmojiFound')}</div>
      )}
    </>
  );

  const navContent = (
    <>
      {recentEmojis.length > 0 && (
        <Tooltip placement="right" content={t('composer.recentEmoji')}>
          <button
            key={RECENT_ID}
            type="button"
            className={`${css.navBtn} ${activeNav === RECENT_ID ? css.navBtnActive : ''}`}
            onClick={() => handleNavClick(RECENT_ID)}
            aria-label={t('composer.recentEmoji')}
          >
            <span className={css.navPill} />
            <ClockIcon size={16} />
          </button>
        </Tooltip>
      )}
      {filteredCategories.map((cat) => {
        let icon: React.ReactNode;
        if (cat.type === 'pack') {
          const first = (cat as CustomPackCategory).emojis[0];
          icon = first ? (
            <AuthMediaImg
              client={ctx.client}
              mxcUrl={first.url}
              width={18}
              height={18}
              alt=""
              className={css.navImg}
            />
          ) : (
            <StickerIcon size={18} />
          );
        } else {
          icon = EMOJI_NAV_ICONS[cat.id] ?? <SmileyIcon size={16} />;
        }
        return (
          <Tooltip key={cat.id} placement="right" content={cat.label}>
            <button
              type="button"
              className={`${css.navBtn} ${activeNav === cat.id ? css.navBtnActive : ''}`}
              onClick={() => handleNavClick(cat.id)}
              aria-label={cat.label}
            >
              <span className={css.navPill} />
              {icon}
            </button>
          </Tooltip>
        );
      })}
    </>
  );

  return (
    <>
      {!embedded && !naked && (
        <div className={css.sheetBackdrop} onClick={() => close()} aria-hidden="true" />
      )}
      <div ref={wrapRef} data-emoji-picker className={naked ? css.pickerWrapNaked : css.pickerWrap}>
        {naked ? (
          <div className={css.body}>
            {!searchQuery && <div className={css.navSidebar}>{navContent}</div>}
            <div className={css.bodyMain}>
              <div className={css.searchWrap}>
                <div className={css.searchInner}>
                  <input
                    ref={searchRef}
                    className={css.searchInput}
                    type="text"
                    placeholder={t('composer.searchEmoji')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button
                    type="button"
                    className={css.searchClearBtn}
                    onClick={() => setSearchQuery('')}
                    aria-label={t('common.clear')}
                    style={{ visibility: searchQuery ? 'visible' : 'hidden' }}
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              </div>
              <div className={css.contentCol}>
                <div ref={bodyRef} className={css.emojiBody}>
                  {emojiContent}
                </div>
                {!drawer && (
                  <PickerPreviewBar
                    client={ctx.client}
                    item={hasResults ? (preview ?? firstPreview) : null}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={css.searchWrap}>
              <div className={css.searchInner}>
                <input
                  ref={searchRef}
                  className={css.searchInput}
                  type="text"
                  placeholder={t('composer.searchEmoji')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button
                  type="button"
                  className={css.searchClearBtn}
                  onClick={() => setSearchQuery('')}
                  aria-label={t('common.clear')}
                  style={{ visibility: searchQuery ? 'visible' : 'hidden' }}
                >
                  <XIcon size={14} />
                </button>
              </div>
              {!embedded && (
                <button
                  type="button"
                  className={css.searchCloseBtn}
                  onClick={() => close()}
                  aria-label={t('common.close')}
                >
                  <XIcon size={16} weight="bold" />
                </button>
              )}
            </div>
            <div className={css.body}>
              {!searchQuery && <div className={css.navSidebar}>{navContent}</div>}
              <div className={css.contentCol}>
                <div ref={bodyRef} className={css.emojiBody}>
                  {emojiContent}
                </div>
                {!drawer && (
                  <PickerPreviewBar
                    client={ctx.client}
                    item={hasResults ? (preview ?? firstPreview) : null}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
