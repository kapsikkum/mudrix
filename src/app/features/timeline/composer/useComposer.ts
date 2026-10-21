import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ClipboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { useAtom, useAtomValue } from 'jotai';
import {
  typingIndicatorsAtom,
  serverUploadLimitAtom,
  composerAttachmentsAtom,
  composerDraftKey,
  mentionInsertAtom,
  commandActionsAtom,
  type ComposerAttachment,
} from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { useConfirm } from '@/app/hooks/useConfirm';
import { getErrorMessage } from '@/util/error';
import { formatFileSize } from '@/util/format';
import { Transforms, type Descendant } from 'slate';
import { ReactEditor } from 'slate-react';
import { useAutocomplete } from '../useAutocomplete';
import type { Suggestion } from '../useAutocomplete';
import { elementCallUiAtom } from '@/app/store/atoms/elementCall';
import { uploadEncryptedFile, buildMediaMessageContent } from '../encryptedMedia';
import { getMediaCacheKey, setCachedBlobUrl } from '../message/mediaCache';
import {
  MATRIX_SPOILER_STABLE_PROPERTY_NAME,
  MATRIX_SPOILER_PROPERTY_NAME,
} from '../message/spoiler';
import { parseCommand, getCommandDefinition } from './commands';
import type { FormatType } from './FormatToolbar';
import type { CommandContext } from './commands';
import { toMarkdown } from './editor/toMarkdown';
import { buildTextContent } from './editor/buildTextContent';
import { sendMessageContent } from './sendMessageContent';
import { useRichEditor } from './useRichEditor';
import type { CustomEditor, MentionElement } from './editor/types';

const EMPTY_ATTACHMENTS: ComposerAttachment[] = [];

interface UseComposerOptions {
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  replyTo: MatrixEvent | null;
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
  isEmpty: boolean;
  attachments: ComposerAttachment[];
  removeAttachment: (id: string) => void;
  updateAttachment: (
    id: string,
    patch: Partial<Pick<ComposerAttachment, 'caption' | 'spoiler'>> & { name?: string }
  ) => void;
}

interface UploadQueueItem {
  file: File;
  caption: string;
  spoiler: boolean;
  replyTo: MatrixEvent | null;
}

function revokeAttachment(item: ComposerAttachment): void {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
}

export function useComposer({
  client,
  roomId,
  threadId,
  replyTo,
  onClearReply,
  onSent,
  droppedFile,
  onDroppedFileConsumed,
}: UseComposerOptions): ComposerState {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const typingIndicators = useAtomValue(typingIndicatorsAtom);
  const maxUploadBytes = useAtomValue(serverUploadLimitAtom);
  const [mentionInsert, setMentionInsert] = useAtom(mentionInsertAtom);
  const confirmDialog = useConfirm();
  const toast = useToast();
  const commandActions = useAtomValue(commandActionsAtom);
  const elementUi = useAtomValue(elementCallUiAtom);

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
      if (!typingIndicators) return;
      if (typing === isTypingRef.current) return;
      isTypingRef.current = typing;
      client.sendTyping(roomId, typing, typing ? 5000 : 0).catch(() => {});
    },
    [client, roomId, typingIndicators]
  );

  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        client.sendTyping(roomId, false, 0).catch(() => {});
      }
    };
  }, [client, roomId]);

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

  const lastEncryptPrepRef = useRef(0);
  const prepareToEncrypt = useCallback(() => {
    const now = Date.now();
    if (now - lastEncryptPrepRef.current < 60_000) return;
    lastEncryptPrepRef.current = now;
    const room = client.getRoom(roomId);
    if (room) client.getCrypto()?.prepareToEncrypt(room);
  }, [client, roomId]);

  useEffect(() => {
    lastEncryptPrepRef.current = 0;
    prepareToEncrypt();
  }, [prepareToEncrypt]);

  const handleEditorChange = useCallback(
    (value: Descendant[]) => {
      handleRichChange(value);
      prepareToEncrypt();
      sendTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => sendTyping(false), 4000);
    },
    [handleRichChange, sendTyping, prepareToEncrypt]
  );

  const sendingRef = useRef(false);
  const enqueueUploadsRef = useRef<(items: UploadQueueItem[]) => void>(() => {});

  const sendAttachments = useCallback(
    (replyToEvent: MatrixEvent | null) => {
      if (attachments.length === 0) return;
      enqueueUploadsRef.current(
        attachments.map((a, i) => ({
          file: a.file,
          caption: a.caption.trim(),
          spoiler: a.spoiler,
          replyTo: i === 0 ? replyToEvent : null,
        }))
      );
      attachments.forEach(revokeAttachment);
      setAttachments(() => []);
      if (replyToEvent) onClearReply();
    },
    [attachments, setAttachments, onClearReply]
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
          const cmd = getCommandDefinition(parsed.command);
          if (cmd) {
            const ctx: CommandContext = {
              client,
              roomId,
              threadId,
              replyTo,
              editorValue,
              navigate,
              t,
              toast,
              confirm: (title: string, message: string, danger?: boolean) =>
                confirmDialog({ title, message, danger }),
              placeCall: commandActions?.placeCall,
              joinVoice: commandActions?.joinVoice,
              hangup: commandActions?.hangup,
              elementCallActive: elementUi.phase === 'joined',
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

        const built = buildTextContent(editorValue, {
          forceFormatted: !!replyTo,
          myId: client.getUserId() ?? '',
        });
        await sendMessageContent(built.content, {
          client,
          roomId,
          threadId,
          replyTo,
          myId: client.getUserId() ?? '',
          mentionedUserIds: built.mentionedUserIds,
        });
        if (replyTo) onClearReply();
        onSent?.();
        sendAttachments(null);
      } catch (err) {
        toast.error(t('timeline.sendFailed', { error: getErrorMessage(err) }));
      }
    } finally {
      sendingRef.current = false;
    }
  }, [
    attachments,
    sendAttachments,
    maxUploadBytes,
    isEmpty,
    editorValue,
    autocomplete,
    clearEditor,
    sendTyping,
    client,
    roomId,
    threadId,
    replyTo,
    onClearReply,
    onSent,
    t,
    toast,
    confirmDialog,
    commandActions,
    elementUi,
    navigate,
  ]);

  const handleEditorKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (handleRichKeyDown(e)) return;
      if (e.key === 'Escape' && replyTo) {
        e.preventDefault();
        onClearReply();
      }
    },
    [handleRichKeyDown, replyTo, onClearReply]
  );

  const addFilesToPreview = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const items = files.map((file) => {
        const oversized = file.size > maxUploadBytes;
        const previewUrl =
          file.type.startsWith('image/') ||
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/')
            ? URL.createObjectURL(file)
            : '';
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl,
          oversized,
          caption: '',
          spoiler: false,
        };
      });
      setAttachments((prev) => [...prev, ...items]);
      requestAnimationFrame(() => ReactEditor.focus(editor));
    },
    [maxUploadBytes, setAttachments, editor]
  );

  const removeAttachment = useCallback(
    (id: string) =>
      setAttachments((prev) => {
        const item = prev.find((a) => a.id === id);
        if (item) revokeAttachment(item);
        return prev.filter((a) => a.id !== id);
      }),
    [setAttachments]
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
      file: File,
      caption: string,
      spoiler: boolean,
      replyToEvent: MatrixEvent | null,
      abortController?: AbortController
    ): Promise<void> => {
      const isImage = file.type.startsWith('image/') && file.type !== 'image/svg+xml';
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      const msgtype = isImage ? 'm.image' : isVideo ? 'm.video' : isAudio ? 'm.audio' : 'm.file';
      const body = caption.length > 0 ? caption : file.name;
      const uploadResult = await uploadEncryptedFile(
        client,
        roomId,
        file,
        () => {},
        setUploadProgress,
        abortController
      );
      if (uploadResult.file) {
        const cacheKey = getMediaCacheKey(uploadResult.file);
        const blobUrl = URL.createObjectURL(file);
        setCachedBlobUrl(cacheKey, blobUrl, file.type);
      }
      let mediaInfo: { mimetype: string; size: number; w?: number; h?: number; duration?: number } =
        {
          mimetype: file.type,
          size: file.size,
        };
      if (isImage) {
        if (uploadResult.mediaWidth && uploadResult.mediaHeight) {
          mediaInfo = { ...mediaInfo, w: uploadResult.mediaWidth, h: uploadResult.mediaHeight };
        }
      } else if (isVideo) {
        if (uploadResult.mediaWidth && uploadResult.mediaHeight) {
          mediaInfo = { ...mediaInfo, w: uploadResult.mediaWidth, h: uploadResult.mediaHeight };
        }
        if (uploadResult.durationMs) {
          mediaInfo = { ...mediaInfo, duration: uploadResult.durationMs };
        }
      }
      const msgContent = buildMediaMessageContent(
        msgtype,
        file.name,
        body,
        uploadResult,
        mediaInfo
      );
      if (spoiler && (isImage || isVideo)) {
        msgContent[MATRIX_SPOILER_STABLE_PROPERTY_NAME] = true;
        msgContent[MATRIX_SPOILER_PROPERTY_NAME] = true;
      }
      await sendMessageContent(msgContent, {
        client,
        roomId,
        threadId,
        replyTo: replyToEvent,
        myId: client.getUserId() ?? '',
      });
    },
    [client, roomId, threadId]
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
        try {
          await uploadOne(item.file, item.caption, item.spoiler, item.replyTo, controller);
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
  }, [uploadOne, onSent, toast, t]);

  const cancelUpload = useCallback(() => {
    uploadAbortRef.current?.abort();
    uploadQueueRef.current = [];
  }, []);

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
    isEmpty,
    attachments,
    removeAttachment,
    updateAttachment,
  };
}
