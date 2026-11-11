import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  type KeyboardEvent,
  type ClipboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { RoomTimeline, WizardClient } from '@wizardchat/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  typingIndicatorsAtom,
  markdownAtom,
  serverUploadLimitAtom,
  composerAttachmentsAtom,
  composerDraftKey,
  composerFocusRequestAtom,
  mentionInsertAtom,
  commandActionsAtom,
  editMessageAtom,
  emoticonsToEmojiAtom,
  type ComposerAttachment,
} from '@/app/store/atoms';
import { useAllRooms, useMembers, useRoom } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import { replaceEmoticonsInValue } from '@/util/emoticons';
import { formatFileSize } from '@/util/format';
import { Editor, Transforms, type Descendant } from 'slate';
import { ReactEditor } from 'slate-react';
import { useAutocomplete } from '../useAutocomplete';
import type { Suggestion } from '../useAutocomplete';
import { callUiAtom } from '@/app/store/atoms/call';
import {
  canCompressVideo,
  compressVideo,
  probeVideoCompression,
  type CompressTarget,
  type VideoQuality,
} from '@/util/videoCompress';
import { isProcessableImage, prepareImage, willProcessImage } from '@/util/imageSanitize';
import { defaultVideoQuality, qualityTarget, useVideoUploadPrefs } from './videoUpload';
import { useImageUploadOptions } from './imageUpload';
import {
  cancelAttachmentUpload,
  forgetAttachmentUpload,
  getAttachmentUpload,
  startAttachmentUpload,
  subscribeAttachmentUpload,
  type PreparedAttachment,
} from './attachmentUploads';
import { getAttachmentQuality, setAttachmentQuality } from './attachmentQuality';
import { parseCommand, getCommandDefinition } from './commands';
import { useIntegrationCommands } from '@/app/features/integrations/ui/useIntegrationCommands';
import { useIntegrationLauncher } from '@/app/features/integrations/ui/runtime';
import type { FormatType } from './FormatToolbar';
import type { CommandContext } from './commands';
import { toMarkdown } from './editor/toMarkdown';
import { buildTextContent } from './editor/buildTextContent';
import { applyInlineMarkdown } from './editor/applyMarkdown';
import {
  applyReplyMetadata,
  applyThreadRelation,
  replyMentions,
  sendTextMessage,
  textMessageFrom,
  type ReplyTarget,
  type TextMessage,
} from './sendMessageContent';
import { editStateFor, findAdjacentEditableMessage } from '../message/editNavigation';
import { useRichEditor } from './useRichEditor';
import { sendGif } from './sendGif';
import { GALLERY_CONTENT_KEY, type GalleryTag } from '../message/gallery';
import { hasGifConsent, parseGifLink, resolveGifLink } from './gifProviders';
import { scheduleMessage } from './delayedEvents';
import type { CustomEditor, MentionElement } from './editor/types';

const EMPTY_ATTACHMENTS: ComposerAttachment[] = [];

interface UseComposerOptions {
  client: WizardClient;
  roomId: string;
  threadId?: string | null;
  getTimeline: () => Promise<RoomTimeline>;
  replyTo: ReplyTarget | null;
  onClearReply: () => void;
  onSent?: () => void;
  droppedFile?: File[] | null;
  onDroppedFileConsumed?: () => void;
}

export interface ComposerState {
  editor: CustomEditor;
  editorValue: Descendant[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  composerWrapRef: React.RefObject<HTMLDivElement | null>;

  toolbar: { activeFormats: FormatType[] } | null;
  autocomplete: ReturnType<typeof useAutocomplete>;

  uploadProgress: number | null;
  uploadFileInfo: { name: string; size: number; current: number; total: number } | null;
  /** Whether `uploadProgress` is the re-encoding of a video rather than its upload. */
  compressing: boolean;

  cancelUpload: () => void;
  handleEditorChange: (value: Descendant[]) => void;
  handleEditorKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  handlePaste: (e: ClipboardEvent<HTMLDivElement>) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAutocompleteSelect: (suggestion: Suggestion) => void;
  handleAutocompleteHover: (index: number) => void;
  applyFormat: (fmt: FormatType, e?: React.MouseEvent) => Promise<void>;
  updateToolbar: () => void;
  linkPopover: { defaultValue: string } | null;
  submitLink: (url: string) => void;
  cancelLink: () => void;
  sendMessage: () => Promise<void>;
  /** Has the homeserver send the composer's text after `delayMs` (send later). Rejects on failure. */
  scheduleSend: (delayMs: number) => Promise<void>;
  /** Plain-text preview of the composer content (empty when there is none). */
  draftText: string;
  /** Identifies this composer to the integration dialogs it opens (api confirmation). */
  integrationOwner: string;
  isEmpty: boolean;
  attachments: ComposerAttachment[];
  removeAttachment: (id: string) => void;
  updateAttachment: (
    id: string,
    patch: Partial<Pick<ComposerAttachment, 'caption' | 'spoiler'>> & { name?: string }
  ) => void;
  /** Picks whether a video is sent as it is or re-encoded smaller when the message is sent. */
  setVideoQuality: (id: string, quality: VideoQuality) => void;
}

interface LeadingText {
  message: TextMessage;
  replyTo: ReplyTarget | null;
  attachmentIds: string[];
}

interface UploadQueueItem {
  attachmentId: string;
  file: File;
  caption: string;
  captionExtra?: TextMessage;
  leadingText?: LeadingText;
  spoiler: boolean;
  /** Set when a video is to be re-encoded for this target before it is uploaded. */
  compressTarget?: CompressTarget;
  replyTo: ReplyTarget | null;
  /** Set on the images of a send with two or more of them, to show them as one gallery. */
  gallery?: GalleryTag | null;
}

/** Still pictures (and GIFs) that can be shown together as one gallery. */
function isGalleryImage(file: File): boolean {
  return file.type.startsWith('image/') && file.type !== 'image/svg+xml';
}

function revokeAttachment(item: ComposerAttachment): void {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
}

export function useComposer({
  client,
  roomId,
  threadId,
  getTimeline,
  replyTo,
  onClearReply,
  onSent,
  droppedFile,
  onDroppedFileConsumed,
}: UseComposerOptions): ComposerState {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const typingIndicators = useAtomValue(typingIndicatorsAtom);
  const markdownEnabled = useAtomValue(markdownAtom);
  const maxUploadBytes = useAtomValue(serverUploadLimitAtom);
  const videoPrefs = useVideoUploadPrefs();
  const imageOptions = useImageUploadOptions();
  // Decided early, so a dropped video already knows whether it can be shrunk.
  useEffect(() => {
    void probeVideoCompression();
  }, []);
  /** What a file is sent as when nothing was picked for it: the settings decide for videos. */
  const defaultQuality = useCallback(
    (file: File): VideoQuality =>
      file.type.startsWith('video/')
        ? defaultVideoQuality(videoPrefs, file.size, maxUploadBytes, canCompressVideo())
        : 'original',
    [videoPrefs, maxUploadBytes]
  );
  const [mentionInsert, setMentionInsert] = useAtom(mentionInsertAtom);
  const setEditMessage = useSetAtom(editMessageAtom);
  const confirmDialog = useConfirm();
  const toast = useToast();
  const commandActions = useAtomValue(commandActionsAtom);
  const callUi = useAtomValue(callUiAtom);
  const { data: members } = useMembers(roomId);
  const rooms = useAllRooms();
  const isEncrypted = useRoom(roomId)?.isEncrypted ?? false;
  const myId = client.userId() ?? '';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerWrapRef = useRef<HTMLDivElement>(null);

  const {
    editor,
    value: editorValue,
    toolbar,
    updateToolbar,
    applyFormat,
    linkPopover,
    submitLink,
    cancelLink,
    autocomplete,
    handleChange: handleRichChange,
    handleKeyDown: handleRichKeyDown,
    handleAutocompleteSelect,
    handleAutocompleteHover,
    clearValue: clearEditor,
    isEmpty,
  } = useRichEditor({
    client,
    roomId,
  });

  const integrationCommands = useIntegrationCommands();
  const integrationOwner = useId();
  const integrationLauncher = useIntegrationLauncher(integrationOwner, roomId);
  const setComposerText = useCallback(
    (text: string) => {
      Transforms.select(editor, Editor.end(editor, []));
      Transforms.insertText(editor, text);
      ReactEditor.focus(editor);
    },
    [editor]
  );
  const draftText = useMemo(
    () => (isEmpty ? '' : toMarkdown(editorValue).markdown.trim()),
    [isEmpty, editorValue]
  );

  const emoticonsToEmoji = useAtomValue(emoticonsToEmojiAtom);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const draftKey = composerDraftKey(roomId, threadId);
  const [allAttachments, setAllAttachments] = useAtom(composerAttachmentsAtom);
  const attachments = allAttachments[draftKey] ?? EMPTY_ATTACHMENTS;
  const setAttachments = useCallback(
    (update: (prev: ComposerAttachment[]) => ComposerAttachment[]) =>
      setAllAttachments((all) => {
        const next = update(all[draftKey] ?? EMPTY_ATTACHMENTS);
        const copy = { ...all };
        if (next.length > 0) copy[draftKey] = next;
        else delete copy[draftKey];
        return copy;
      }),
    [draftKey, setAllAttachments]
  );

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [uploadFileInfo, setUploadFileInfo] = useState<{
    name: string;
    size: number;
    current: number;
    total: number;
  } | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);
  const uploadingRef = useRef(false);
  const uploadPosRef = useRef(0);

  const sendTyping = useCallback(
    (typing: boolean) => {
      if (!typingIndicators || threadId) return;
      if (typing === isTypingRef.current) return;
      isTypingRef.current = typing;
      getTimeline()
        .then((timeline) => timeline.setTyping(typing))
        .catch(() => {});
    },
    [getTimeline, threadId, typingIndicators]
  );

  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        getTimeline()
          .then((timeline) => timeline.setTyping(false))
          .catch(() => {});
      }
    };
  }, [getTimeline]);

  useEffect(() => {
    if (replyTo) {
      ReactEditor.focus(editor);
    }
  }, [replyTo, editor]);

  useEffect(() => {
    if (!mentionInsert) return;
    const mentionNode: MentionElement = {
      type: 'mention',
      userId: mentionInsert.userId,
      displayName: mentionInsert.displayName,
      children: [{ text: '' }],
    };
    ReactEditor.focus(editor);
    Transforms.insertNodes(editor, mentionNode);
    Transforms.move(editor, { unit: 'offset' });
    Transforms.insertText(editor, ' ');
    setMentionInsert(null);
  }, [mentionInsert, editor, setMentionInsert]);

  const handleEditorChange = useCallback(
    (value: Descendant[]) => {
      handleRichChange(value);
      sendTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => sendTyping(false), 4000);
    },
    [handleRichChange, sendTyping]
  );

  const sendingRef = useRef(false);
  const enqueueUploadsRef = useRef<(items: UploadQueueItem[]) => void>(() => {});

  const sendAttachments = useCallback(
    (replyToEvent: ReplyTarget | null, text?: TextMessage) => {
      if (attachments.length === 0) return;
      // Two or more pictures sent together are tagged so every client of ours shows them as one set
      const imageCount = attachments.filter((a) => isGalleryImage(a.file)).length;
      const galleryId = imageCount >= 2 ? crypto.randomUUID() : null;
      let galleryIndex = 0;
      const items: UploadQueueItem[] = attachments.map((a, i) => ({
        attachmentId: a.id,
        file: a.file,
        caption: a.caption.trim(),
        spoiler: a.spoiler,
        compressTarget: qualityTarget(
          getAttachmentQuality(a.id) ?? defaultQuality(a.file),
          videoPrefs,
          maxUploadBytes
        ),
        replyTo: i === 0 ? replyToEvent : null,
        gallery:
          galleryId && isGalleryImage(a.file)
            ? { id: galleryId, index: galleryIndex++, count: imageCount }
            : null,
      }));
      if (text && items.length === 1 && !items[0].caption) {
        items[0].caption = text.body;
        items[0].captionExtra = text;
      } else if (text) {
        items[0].replyTo = null;
        items[0].leadingText = {
          message: text,
          replyTo: replyToEvent,
          attachmentIds: items.map((item) => item.attachmentId),
        };
      }
      enqueueUploadsRef.current(items);
      attachments.forEach((a) => setAttachmentQuality(a.id, undefined));
      attachments.forEach(revokeAttachment);
      setAttachments(() => []);
      if (replyToEvent) onClearReply();
    },
    [attachments, setAttachments, onClearReply, defaultQuality, videoPrefs, maxUploadBytes]
  );

  const sendMessage = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      if (attachments.some((a) => a.oversized)) {
        toast.error(t('attachment.removeOversized', { limit: formatFileSize(maxUploadBytes) }));
        return;
      }
      if (isEmpty) {
        sendAttachments(replyTo);
        return;
      }
      autocomplete.close();

      const { markdown } = toMarkdown(editorValue);
      const text = markdown.trim();
      if (!text) {
        sendAttachments(replyTo);
        return;
      }

      clearEditor();
      sendTyping(false);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

      try {
        const parsed = parseCommand(text);
        if (parsed) {
          const cmd = getCommandDefinition(parsed.command, integrationCommands);
          if (cmd) {
            const ctx: CommandContext = {
              client,
              roomId,
              threadId,
              replyTo,
              getTimeline,
              members: members ?? [],
              rooms,
              myId,
              editorValue,
              navigate,
              t,
              toast,
              confirm: (title: string, message: string, danger?: boolean) =>
                confirmDialog({ title, message, danger }),
              placeCall: commandActions?.placeCall,
              joinVoice: commandActions?.joinVoice,
              hangup: commandActions?.hangup,
              callActive: callUi.phase === 'joined',
              markdown: markdownEnabled,
              setComposerText,
              openApiConfirm: (req) =>
                integrationLauncher.openApi(req.integrationId, req.actionId, req.args, req.args),
            };
            try {
              await cmd.fn(parsed.args, ctx);
            } catch (cmdErr) {
              toast.error(getErrorMessage(cmdErr));
            }
            if (replyTo) onClearReply();
            return;
          }
          // Not a known command: fall through and send as literal text.
        }

        // A message that is just a GIPHY / KLIPY link goes out as the GIF itself (once the user
        // has agreed to contact the GIF services); if it can't be fetched it is sent as the link.
        const gifLink = attachments.length === 0 ? parseGifLink(text) : null;
        if (gifLink && hasGifConsent(gifLink.provider)) {
          try {
            const gif = await resolveGifLink(gifLink);
            if (gif) {
              await sendGif(gif, {
                client,
                timeline: await getTimeline(),
                isEncrypted,
                threadId,
                replyTo,
              });
              if (replyTo) onClearReply();
              onSent?.();
              return;
            }
          } catch {
            // Couldn't fetch it: send the link as ordinary text below.
          }
        }

        const withEmoji = emoticonsToEmoji ? replaceEmoticonsInValue(editorValue) : editorValue;
        const built = buildTextContent(
          markdownEnabled ? applyInlineMarkdown(withEmoji) : withEmoji,
          {
            forceFormatted: !!replyTo,
            myId,
          }
        );
        const message = textMessageFrom('text', built);
        if (attachments.length > 0) {
          sendAttachments(replyTo, message);
          onSent?.();
          return;
        }
        const timeline = await getTimeline();
        await sendTextMessage(timeline, message, { replyTo, myId });
        if (replyTo) onClearReply();
        onSent?.();
      } catch (err) {
        toast.error(t('timeline.sendFailed', { error: getErrorMessage(err) }));
      }
    } finally {
      sendingRef.current = false;
    }
  }, [
    emoticonsToEmoji,
    attachments,
    sendAttachments,
    maxUploadBytes,
    isEmpty,
    editorValue,
    markdownEnabled,
    autocomplete,
    clearEditor,
    sendTyping,
    client,
    roomId,
    threadId,
    getTimeline,
    members,
    rooms,
    myId,
    replyTo,
    onClearReply,
    onSent,
    t,
    toast,
    confirmDialog,
    commandActions,
    callUi,
    navigate,
    isEncrypted,
    integrationCommands,
    integrationLauncher,
    setComposerText,
  ]);

  const scheduleSend = useCallback(
    async (delayMs: number) => {
      const text = toMarkdown(editorValue).markdown.trim();
      if (!text) throw new Error(t('composer.schedule.noDraft'));
      const parsed = parseCommand(text);
      if (parsed && getCommandDefinition(parsed.command, integrationCommands)) {
        throw new Error(t('composer.schedule.noCommands'));
      }
      const withEmoji = emoticonsToEmoji ? replaceEmoticonsInValue(editorValue) : editorValue;
      const built = buildTextContent(markdownEnabled ? applyInlineMarkdown(withEmoji) : withEmoji, {
        forceFormatted: !!replyTo,
        myId,
      });
      applyReplyMetadata(built.content, {
        replyTo,
        myId,
        mentionedUserIds: built.mentionedUserIds,
      });
      if (threadId) applyThreadRelation(built.content, threadId, replyTo);
      await scheduleMessage(client, roomId, built.content, delayMs);
      clearEditor();
      if (replyTo) onClearReply();
    },
    [
      editorValue,
      emoticonsToEmoji,
      markdownEnabled,
      client,
      roomId,
      threadId,
      replyTo,
      myId,
      onClearReply,
      clearEditor,
      t,
      integrationCommands,
    ]
  );

  const handleEditorKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (handleRichKeyDown(e)) return;
      if (e.key === 'Escape' && replyTo) {
        e.preventDefault();
        onClearReply();
        return;
      }
      const plain = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
      if (e.key === 'ArrowUp' && plain && isEmpty && attachments.length === 0) {
        const last = findAdjacentEditableMessage(client, roomId, threadId, null, 'previous');
        if (!last) return;
        e.preventDefault();
        setEditMessage(editStateFor(last, roomId, threadId));
      }
    },
    [
      handleRichKeyDown,
      replyTo,
      onClearReply,
      isEmpty,
      attachments.length,
      client,
      roomId,
      threadId,
      setEditMessage,
    ]
  );

  const addFilesToPreview = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const items = files.map((file) => {
        // A video or photo the settings will shrink is not too large: it is sent smaller.
        const shrinks = isProcessableImage(file) && imageOptions.maxSide !== null;
        const oversized =
          file.size > maxUploadBytes && defaultQuality(file) === 'original' && !shrinks;
        const previewUrl =
          file.type.startsWith('image/') ||
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/')
            ? URL.createObjectURL(file)
            : '';
        return {
          id: crypto.randomUUID(),
          file,
          previewUrl,
          oversized,
          caption: '',
          spoiler: false,
        };
      });
      setAttachments((prev) => [...prev, ...items]);
      for (const item of items) {
        // The original is uploaded in the background as soon as it is attached. A video that is
        // re-encoded on send has no use for that, and a photo that is to lose its metadata must
        // never be uploaded as it is.
        if (
          !item.oversized &&
          defaultQuality(item.file) === 'original' &&
          !willProcessImage(item.file, imageOptions)
        ) {
          void startAttachmentUpload(item.id, item.file, getTimeline);
        }
      }
      requestAnimationFrame(() => ReactEditor.focus(editor));
    },
    [maxUploadBytes, defaultQuality, imageOptions, setAttachments, editor, getTimeline]
  );

  const focusRequest = useAtomValue(composerFocusRequestAtom);
  useEffect(() => {
    if (focusRequest?.key !== draftKey) return;
    requestAnimationFrame(() => {
      try {
        Transforms.select(editor, Editor.end(editor, []));
        ReactEditor.focus(editor);
      } catch {
        // editor not mounted
      }
    });
  }, [focusRequest, draftKey, editor]);

  // Landing in a room or DM, or coming back to the window (restored, or tabbed back in), puts the
  // cursor in the message box. Skipped on touch devices, where it would raise the keyboard, and when
  // focus is already in a field or dialog on purpose; a room-list button or the page itself does not
  // count as that, so clicking through rooms keeps typing one click away.
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return undefined;
    const focusIfIdle = () => {
      const active = document.activeElement;
      if (
        active?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]'
        )
      ) {
        return;
      }
      try {
        const node = ReactEditor.toDOMNode(editor, editor);
        if (!node.isConnected || node.getClientRects().length === 0) return;
        ReactEditor.focus(editor);
      } catch {
        // editor not mounted
      }
    };
    const frame = requestAnimationFrame(focusIfIdle);
    window.addEventListener('focus', focusIfIdle);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('focus', focusIfIdle);
    };
  }, [editor, draftKey]);

  const removeAttachment = useCallback(
    (id: string) => {
      cancelAttachmentUpload(id);
      setAttachmentQuality(id, undefined);
      setAttachments((prev) => {
        const item = prev.find((a) => a.id === id);
        if (item) revokeAttachment(item);
        return prev.filter((a) => a.id !== id);
      });
    },
    [setAttachments]
  );

  const setVideoQuality = useCallback<ComposerState['setVideoQuality']>(
    (id, quality) => {
      setAttachmentQuality(id, quality);
      const item = attachments.find((a) => a.id === id);
      // A video over the server limit can't be sent as it is, but can once it is re-encoded.
      const oversized = !!item && quality === 'original' && item.file.size > maxUploadBytes;
      setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, oversized } : a)));
      if (quality !== 'original') {
        cancelAttachmentUpload(id);
        return;
      }
      if (item && !oversized) void startAttachmentUpload(id, item.file, getTimeline);
    },
    [attachments, getTimeline, maxUploadBytes, setAttachments]
  );

  const updateAttachment = useCallback<ComposerState['updateAttachment']>(
    (id, { name, ...patch }) =>
      setAttachments((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          const trimmed = name?.trim();
          const file =
            trimmed && trimmed !== a.file.name
              ? new File([a.file], trimmed, {
                  type: a.file.type,
                  lastModified: a.file.lastModified,
                })
              : a.file;
          return { ...a, ...patch, file };
        })
      ),
    [setAttachments]
  );

  useEffect(() => {
    if (!droppedFile || droppedFile.length === 0) return;
    addFilesToPreview(droppedFile);
    onDroppedFileConsumed?.();
  }, [droppedFile, addFilesToPreview, onDroppedFileConsumed]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFilesToPreview(Array.from(e.target.files));
    e.target.value = '';
  };

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length === 0) return;
      e.preventDefault();
      addFilesToPreview(files);
    },
    [addFilesToPreview]
  );

  const uploadOne = useCallback(
    async (
      attachmentId: string,
      file: File,
      caption: string,
      spoiler: boolean,
      replyToEvent: ReplyTarget | null,
      abortController?: AbortController,
      captionExtra?: TextMessage,
      compressTarget?: CompressTarget,
      gallery?: GalleryTag | null
    ): Promise<void> => {
      const originalFile = file;
      if (compressTarget && originalFile.type.startsWith('video/')) {
        // The original may already be uploading in the background; it is not what gets sent.
        cancelAttachmentUpload(attachmentId);
        setCompressing(true);
        setUploadProgress(0);
        try {
          file = await compressVideo(originalFile, {
            target: compressTarget,
            onProgress: setUploadProgress,
            signal: abortController?.signal ?? new AbortController().signal,
          });
        } catch (err) {
          // A cancel aborts this send; any other failure sends the video as it was picked.
          if (
            abortController?.signal.aborted ||
            (err instanceof DOMException && err.name === 'AbortError')
          ) {
            throw err;
          }
          toast.error(t('composer.compressFailed'));
        } finally {
          setCompressing(false);
        }
      }
      if (willProcessImage(originalFile, imageOptions)) {
        cancelAttachmentUpload(attachmentId);
        try {
          file = await prepareImage(originalFile, imageOptions);
        } catch {
          // Sending the photo as it is would defeat removing what is in it; a resize can be skipped.
          if (imageOptions.stripMetadata) throw new Error(t('composer.photoPrepareFailed'));
        }
      }
      // The status bar was started with the original's details; show what is actually uploaded.
      if (file !== originalFile) {
        setUploadFileInfo((info) => (info ? { ...info, name: file.name, size: file.size } : info));
      }
      // The original was let through only because it was going to be re-encoded.
      if (file.size > maxUploadBytes) {
        throw new Error(t('attachment.fileTooLarge', { limit: formatFileSize(maxUploadBytes) }));
      }
      const isImage = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
      const isVideo = file.type.startsWith('video/');
      const resultPromise = startAttachmentUpload(attachmentId, file, getTimeline);
      const syncProgress = () =>
        setUploadProgress(getAttachmentUpload(attachmentId)?.progress ?? 0);
      syncProgress();
      const unsubscribe = subscribeAttachmentUpload(attachmentId, syncProgress);
      const onAbort = () => cancelAttachmentUpload(attachmentId);
      abortController?.signal.addEventListener('abort', onAbort);
      let prepared: PreparedAttachment;
      try {
        prepared = await resultPromise;
      } finally {
        unsubscribe();
        abortController?.signal.removeEventListener('abort', onAbort);
      }
      if (abortController?.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      forgetAttachmentUpload(attachmentId);
      setUploadProgress(0);
      const timeline = await getTimeline();
      const mentionedUserIds = captionExtra?.mentionedUserIds ?? [];
      const mentions =
        captionExtra || replyToEvent?.eventId
          ? replyMentions(
              { replyTo: replyToEvent, myId, mentionedUserIds },
              captionExtra?.roomMentioned ?? false
            )
          : null;
      await timeline.sendUploaded({
        source: prepared.source,
        size: prepared.size,
        filename: file.name,
        mimetype: file.type || 'application/octet-stream',
        caption: caption.length > 0 ? caption : null,
        captionHtml: captionExtra?.html ?? null,
        mentions,
        width: isImage || isVideo ? (prepared.width ?? null) : null,
        height: isImage || isVideo ? (prepared.height ?? null) : null,
        durationMs: isVideo ? (prepared.durationMs ?? null) : null,
        thumbnail: isImage || isVideo ? prepared.thumbnail : null,
        isAnimated: isImage ? (prepared.isAnimated ?? false) : false,
        spoiler: spoiler && (isImage || isVideo),
        replyTo: replyToEvent?.eventId ?? null,
        extraContent: gallery && isImage ? { [GALLERY_CONTENT_KEY]: gallery } : null,
      });
      setUploadProgress(1);
    },
    [getTimeline, myId, toast, t, maxUploadBytes, imageOptions]
  );

  const sendLeadingText = useCallback(
    async (leading: LeadingText) => {
      try {
        const timeline = await getTimeline();
        await sendTextMessage(timeline, leading.message, { replyTo: leading.replyTo, myId });
      } catch (err) {
        toast.error(t('timeline.sendFailed', { error: getErrorMessage(err) }));
      }
    },
    [getTimeline, myId, toast, t]
  );

  const processUploadQueue = useCallback(async () => {
    if (uploadingRef.current) return;
    if (uploadQueueRef.current.length === 0) return;
    uploadingRef.current = true;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    let index = 0;
    let failed = 0;
    uploadPosRef.current = 0;
    try {
      while (index < uploadQueueRef.current.length) {
        if (controller.signal.aborted) break;
        const total = uploadQueueRef.current.length;
        const item = uploadQueueRef.current[index];
        uploadPosRef.current = index;
        setUploadFileInfo({
          name: item.file.name,
          size: item.file.size,
          current: index + 1,
          total,
        });
        if (item.leadingText) {
          const leading = item.leadingText;
          item.leadingText = undefined;
          // Wait for the whole batch, so the text and its files arrive back-to-back
          // (files that are re-encoded or cleaned first are prepared when their turn comes)
          const batch = uploadQueueRef.current.filter(
            (q) =>
              leading.attachmentIds.includes(q.attachmentId) &&
              !q.compressTarget &&
              !willProcessImage(q.file, imageOptions)
          );
          await Promise.allSettled(
            batch.map((q) => startAttachmentUpload(q.attachmentId, q.file, getTimeline))
          );
          await sendLeadingText(leading);
        }
        try {
          await uploadOne(
            item.attachmentId,
            item.file,
            item.caption,
            item.spoiler,
            item.replyTo,
            controller,
            item.captionExtra,
            item.compressTarget,
            item.gallery
          );
          onSent?.();
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') break;
          failed += 1;
          toast.error(t('timeline.uploadFailed', { error: getErrorMessage(err) }));
        }
        index += 1;
      }
      if (failed > 0 && uploadQueueRef.current.length > 1) {
        toast.error(
          t('timeline.uploadFailedMany', { failed, total: uploadQueueRef.current.length })
        );
      }
    } finally {
      uploadingRef.current = false;
      uploadQueueRef.current = [];
      setUploadProgress(null);
      setUploadFileInfo(null);
      uploadAbortRef.current = null;
    }
  }, [uploadOne, sendLeadingText, onSent, toast, t, getTimeline, imageOptions]);

  const cancelUpload = useCallback(() => {
    // Cancelling drops the files, but text sent along with them still goes out
    const texts = uploadQueueRef.current.flatMap((item) => {
      const leading = item.leadingText;
      item.leadingText = undefined;
      return leading ? [leading] : [];
    });
    uploadAbortRef.current?.abort();
    uploadQueueRef.current.forEach((item) => cancelAttachmentUpload(item.attachmentId));
    uploadQueueRef.current = [];
    texts.forEach((leading) => void sendLeadingText(leading));
  }, [sendLeadingText]);

  const enqueueUploads = useCallback(
    (items: UploadQueueItem[]) => {
      uploadQueueRef.current.push(...items);
      if (uploadingRef.current) {
        const item = uploadQueueRef.current[uploadPosRef.current];
        if (item) {
          setUploadFileInfo({
            name: item.file.name,
            size: item.file.size,
            current: uploadPosRef.current + 1,
            total: uploadQueueRef.current.length,
          });
        }
      } else {
        void processUploadQueue();
      }
    },
    [processUploadQueue]
  );
  enqueueUploadsRef.current = enqueueUploads;

  return {
    editor,
    editorValue,
    fileInputRef,
    composerWrapRef,
    toolbar,
    autocomplete,
    uploadProgress,
    uploadFileInfo,
    compressing,
    cancelUpload,
    handleEditorChange,
    handleEditorKeyDown,
    handlePaste,
    handleFileSelect,
    handleAutocompleteSelect,
    handleAutocompleteHover,
    applyFormat,
    updateToolbar,
    linkPopover,
    submitLink,
    cancelLink,
    sendMessage,
    scheduleSend,
    draftText,
    integrationOwner,
    isEmpty,
    attachments,
    removeAttachment,
    updateAttachment,
    setVideoQuality,
  };
}
