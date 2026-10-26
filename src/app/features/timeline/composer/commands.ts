import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { EventType } from 'matrix-js-sdk';
import { Text, type Descendant } from 'slate';
import { fromMarkdown, type MentionResolver } from './editor/fromMarkdown';
import { buildTextContent } from './editor/buildTextContent';
import { sendMessageContent } from './sendMessageContent';
import { viaServersFor } from '@/util/matrix';
import { canSendState } from '@/app/hooks/useCanSendState';
import type { CustomElement, EmoticonElement } from './editor/types';

export interface CommandContext {
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  replyTo?: MatrixEvent | null;
  editorValue?: Descendant[];
  navigate: (path: string) => void;
  t: (key: string, opts?: Record<string, string>) => string;
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
  };
  confirm?: (title: string, message: string, danger?: boolean) => Promise<boolean>;
  placeCall?: (roomId: string) => Promise<void> | void;
  joinVoice?: (roomId: string) => Promise<void> | void;
  hangup?: () => void;
  callActive: boolean;
}

export interface CommandDefinition {
  command: string;
  aliases: string[];
  description: (t: (key: string) => string) => string;
  usage: string;
  fn: (args: string, ctx: CommandContext) => Promise<void>;
}

type CommandHandler = (args: string, ctx: CommandContext) => Promise<void>;

async function resolveTargetRoomId(ctx: CommandContext, args: string): Promise<string> {
  const alias = args.trim();
  if (!alias) return ctx.roomId;
  try {
    const res = await ctx.client.getRoomIdForAlias(alias);
    return res.room_id;
  } catch {
    throw new Error(ctx.t('timeline.commands.roomNotFound', { alias }));
  }
}

function resolveUserId(
  client: MatrixClient,
  roomId: string,
  raw: string
): { userId: string; displayName: string } {
  const stripped = raw.startsWith('@') ? raw.slice(1) : raw;

  const room = client.getRoom(roomId);
  if (room) {
    const members = room.getMembers();
    for (const m of members) {
      const displayName = m.name ?? m.userId;
      if (displayName === stripped || m.userId === raw || m.userId === `@${stripped}`) {
        return { userId: m.userId, displayName };
      }
    }
  }

  return { userId: `@${stripped}`, displayName: stripped };
}

function buildRoomMentionResolver(
  client: MatrixClient,
  roomId: string
): MentionResolver | undefined {
  const room = client.getRoom(roomId);
  if (!room) return undefined;
  const tokens: MentionResolver['tokens'] = [];
  const seen = new Set<string>();
  for (const m of room.getMembers()) {
    const name = m.name ?? m.userId;
    const add = (token: string) => {
      if (token.length < 2 || seen.has(token)) return;
      seen.add(token);
      tokens.push({ token, userId: m.userId, displayName: name });
    };
    add(`@${name}`);
    add(`@${m.userId}`);
  }
  tokens.sort((a, b) => b.token.length - a.token.length);
  return tokens.length > 0 ? { tokens } : undefined;
}

const SHORTCODE_RE = /:([a-zA-Z0-9_-]+):/g;

function collectEmoticons(editorValue: Descendant[]): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (nodes: Descendant[]) => {
    for (const node of nodes) {
      const el = node as CustomElement;
      if (el.type === 'emoticon') {
        const e = el as EmoticonElement;
        if (!map.has(e.shortcode)) map.set(e.shortcode, e.mxcUrl);
      }
      if (el.children && Array.isArray(el.children)) visit(el.children as Descendant[]);
    }
  };
  visit(editorValue);
  return map;
}

function injectEmoticons(nodes: Descendant[], emoticons: Map<string, string>): Descendant[] {
  if (emoticons.size === 0) return nodes;
  const out: Descendant[] = [];
  for (const node of nodes) {
    if (Text.isText(node)) {
      const leaf = node as Text;
      const text = leaf.text;
      if (!text.includes(':')) {
        out.push(leaf);
        continue;
      }
      SHORTCODE_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      let last = 0;
      let replaced = false;
      while ((match = SHORTCODE_RE.exec(text)) !== null) {
        const mxcUrl = emoticons.get(match[1]);
        if (!mxcUrl) continue;
        replaced = true;
        if (match.index > last) out.push({ ...leaf, text: text.slice(last, match.index) });
        out.push({
          type: 'emoticon',
          shortcode: match[1],
          mxcUrl,
          children: [{ text: '' }],
        } as EmoticonElement);
        last = match.index + match[0].length;
      }
      if (!replaced) {
        out.push(leaf);
        continue;
      }
      if (last < text.length) out.push({ ...leaf, text: text.slice(last) });
    } else {
      const el = node as CustomElement;
      if (el.type === 'code-block') {
        out.push(el);
        continue;
      }
      if (el.children && Array.isArray(el.children)) {
        out.push({ ...el, children: injectEmoticons(el.children, emoticons) } as CustomElement);
      } else {
        out.push(el);
      }
    }
  }
  return out;
}

function buildCommandText(
  client: MatrixClient,
  roomId: string,
  text: string,
  msgtype: string,
  editorValue?: Descendant[]
): { content: Record<string, unknown>; formattedBody: string; mentionedUserIds: string[] } {
  const myId = client.getUserId() ?? '';
  const resolver = buildRoomMentionResolver(client, roomId);
  const emoticons = editorValue ? collectEmoticons(editorValue) : new Map();
  const nodes = injectEmoticons(fromMarkdown(text, resolver), emoticons);
  const built = buildTextContent(nodes, { myId });
  return {
    content: { ...built.content, msgtype },
    formattedBody: built.formattedBody,
    mentionedUserIds: built.mentionedUserIds,
  };
}

const handleMe: CommandHandler = async (
  args,
  { client, roomId, threadId, replyTo, editorValue }
) => {
  if (!args.trim()) throw new Error('Usage: /me <message>');
  const { content, mentionedUserIds } = buildCommandText(
    client,
    roomId,
    args,
    'm.emote',
    editorValue
  );
  await sendMessageContent(content, {
    client,
    roomId,
    threadId,
    replyTo,
    myId: client.getUserId() ?? undefined,
    mentionedUserIds,
  });
};

const handleNotice: CommandHandler = async (
  args,
  { client, roomId, threadId, replyTo, editorValue }
) => {
  if (!args.trim()) throw new Error('Usage: /notice <message>');
  const { content, mentionedUserIds } = buildCommandText(
    client,
    roomId,
    args,
    'm.notice',
    editorValue
  );
  await sendMessageContent(content, {
    client,
    roomId,
    threadId,
    replyTo,
    myId: client.getUserId() ?? undefined,
    mentionedUserIds,
  });
};

const handleJoin: CommandHandler = async (args, ctx) => {
  const trimmed = args.trim();
  const voiceMatch = trimmed.match(/^voice(?:\s+(.*))?$/i);
  if (voiceMatch) {
    await handleJoinVoice(voiceMatch[1] ?? '', ctx);
    return;
  }
  const alias = trimmed;
  if (!alias) throw new Error('Usage: /join <room_alias>');
  const viaServers = viaServersFor(alias, ctx.client.getDomain()).viaServers;
  await ctx.client.joinRoom(alias, viaServers.length > 0 ? { viaServers } : undefined);
  ctx.toast.success(ctx.t('timeline.commands.join.joined', { alias }));
};

const handleJoinVoice: CommandHandler = async (args, ctx) => {
  if (!ctx.joinVoice) throw new Error(ctx.t('timeline.commands.callUnavailable'));
  const targetRoomId = await resolveTargetRoomId(ctx, args);
  await ctx.joinVoice(targetRoomId);
};

const handleCall: CommandHandler = async (args, ctx) => {
  if (ctx.callActive) throw new Error(ctx.t('voice.toastAlreadyInCall'));
  if (!ctx.placeCall) throw new Error(ctx.t('timeline.commands.callUnavailable'));
  const targetRoomId = await resolveTargetRoomId(ctx, args);
  await ctx.placeCall(targetRoomId);
};

const handleHangup: CommandHandler = async (_args, ctx) => {
  if (ctx.callActive) {
    ctx.hangup?.();
    return;
  }
  throw new Error(ctx.t('voice.noActiveCall'));
};

const handlePart: CommandHandler = async (
  _args,
  { client, roomId, navigate, t, confirm, toast }
) => {
  const name = client.getRoom(roomId)?.name ?? roomId;
  const ok = confirm
    ? await confirm(t('room.leaveRoom'), t('room.leaveRoomConfirm', { name }), true)
    : true;
  if (!ok) return;
  await client.leave(roomId);
  toast.success(t('room.leaveSuccess', { name }));
  navigate('/');
};

const handleKick: CommandHandler = async (args, { client, roomId }) => {
  const parts = args.trim().split(/\s+/);
  if (!parts[0]) throw new Error('Usage: /kick <user> [reason]');
  const { userId } = resolveUserId(client, roomId, parts[0]);
  const reason = parts.slice(1).join(' ') || undefined;
  await client.kick(roomId, userId, reason);
};

const handleBan: CommandHandler = async (args, { client, roomId }) => {
  const parts = args.trim().split(/\s+/);
  if (!parts[0]) throw new Error('Usage: /ban <user> [reason]');
  const { userId } = resolveUserId(client, roomId, parts[0]);
  const reason = parts.slice(1).join(' ') || undefined;
  await client.ban(roomId, userId, reason);
};

const handleUnban: CommandHandler = async (args, { client, roomId }) => {
  const raw = args.trim();
  if (!raw) throw new Error('Usage: /unban <user>');
  const { userId } = resolveUserId(client, roomId, raw);
  await client.unban(roomId, userId);
};

const handleInvite: CommandHandler = async (args, { client, roomId }) => {
  const raw = args.trim();
  if (!raw) throw new Error('Usage: /invite <user>');
  const { userId } = resolveUserId(client, roomId, raw);
  await client.invite(roomId, userId);
};

const handleTopic: CommandHandler = async (args, { client, roomId }) => {
  const topic = args.trim();
  if (!topic) throw new Error('Usage: /topic <new_topic>');
  if (!canSendState(client.getRoom(roomId), EventType.RoomTopic, client)) {
    throw new Error('You do not have permission to change the room topic');
  }
  await client.sendStateEvent(roomId, EventType.RoomTopic, { topic }, '');
};

const handleRoomName: CommandHandler = async (args, { client, roomId }) => {
  const name = args.trim();
  if (!name) throw new Error('Usage: /roomname <new_name>');
  if (!canSendState(client.getRoom(roomId), EventType.RoomName, client)) {
    throw new Error('You do not have permission to rename the room');
  }
  await client.sendStateEvent(roomId, EventType.RoomName, { name }, '');
};

const handleNick: CommandHandler = async (args, { client }) => {
  const name = args.trim();
  if (!name) throw new Error('Usage: /nick <display_name>');
  await client.setDisplayName(name);
};

const handleSpoiler: CommandHandler = async (
  args,
  { client, roomId, threadId, replyTo, editorValue }
) => {
  if (!args.trim()) throw new Error('Usage: /spoiler ["reason"] <message>');
  let reason = '';
  let body = args;
  const reasonMatch = args.match(/^"(.+?)"\s+(.*)/s);
  if (reasonMatch) {
    reason = reasonMatch[1];
    body = reasonMatch[2];
  }
  const { content, formattedBody, mentionedUserIds } = buildCommandText(
    client,
    roomId,
    body,
    'm.text',
    editorValue
  );
  const escapedReason = reason.replace(/"/g, '&quot;');
  content.format = 'org.matrix.custom.html';
  content.formatted_body = reason
    ? `<span data-mx-spoiler="${escapedReason}">${formattedBody}</span>`
    : `<span data-mx-spoiler>${formattedBody}</span>`;
  await sendMessageContent(content, {
    client,
    roomId,
    threadId,
    replyTo,
    myId: client.getUserId() ?? undefined,
    mentionedUserIds,
  });
};

export const COMMANDS: CommandDefinition[] = [
  {
    command: 'me',
    aliases: [],
    description: (t) => t('timeline.commands.me.description'),
    usage: '/me <message>',
    fn: handleMe,
  },
  {
    command: 'notice',
    aliases: [],
    description: (t) => t('timeline.commands.notice.description'),
    usage: '/notice <message>',
    fn: handleNotice,
  },
  {
    command: 'join',
    aliases: [],
    description: (t) => t('timeline.commands.join.description'),
    usage: '/join <room_alias>',
    fn: handleJoin,
  },
  {
    command: 'join-voice',
    aliases: [],
    description: (t) => t('timeline.commands.joinVoice.description'),
    usage: '/join-voice [room]',
    fn: handleJoinVoice,
  },
  {
    command: 'call',
    aliases: [],
    description: (t) => t('timeline.commands.call.description'),
    usage: '/call [room]',
    fn: handleCall,
  },
  {
    command: 'hangup',
    aliases: [],
    description: (t) => t('timeline.commands.hangup.description'),
    usage: '/hangup',
    fn: handleHangup,
  },
  {
    command: 'part',
    aliases: ['leave'],
    description: (t) => t('timeline.commands.part.description'),
    usage: '/part',
    fn: handlePart,
  },
  {
    command: 'kick',
    aliases: [],
    description: (t) => t('timeline.commands.kick.description'),
    usage: '/kick <user> [reason]',
    fn: handleKick,
  },
  {
    command: 'ban',
    aliases: [],
    description: (t) => t('timeline.commands.ban.description'),
    usage: '/ban <user> [reason]',
    fn: handleBan,
  },
  {
    command: 'unban',
    aliases: [],
    description: (t) => t('timeline.commands.unban.description'),
    usage: '/unban <user>',
    fn: handleUnban,
  },
  {
    command: 'invite',
    aliases: [],
    description: (t) => t('timeline.commands.invite.description'),
    usage: '/invite <user>',
    fn: handleInvite,
  },
  {
    command: 'topic',
    aliases: [],
    description: (t) => t('timeline.commands.topic.description'),
    usage: '/topic <new_topic>',
    fn: handleTopic,
  },
  {
    command: 'roomname',
    aliases: [],
    description: (t) => t('timeline.commands.roomname.description'),
    usage: '/roomname <new_name>',
    fn: handleRoomName,
  },
  {
    command: 'nick',
    aliases: [],
    description: (t) => t('timeline.commands.nick.description'),
    usage: '/nick <display_name>',
    fn: handleNick,
  },
  {
    command: 'spoiler',
    aliases: ['cw', 'content-warning'],
    description: (t) => t('timeline.commands.spoiler.description'),
    usage: '/spoiler ["reason"] <message>',
    fn: handleSpoiler,
  },
];

const ALL_COMMANDS = new Map<string, CommandDefinition>();
for (const cmd of COMMANDS) {
  ALL_COMMANDS.set(cmd.command, cmd);
  for (const alias of cmd.aliases) {
    ALL_COMMANDS.set(alias, cmd);
  }
}

export function parseCommand(text: string): { command: string; args: string } | null {
  const match = text.match(/^\/([\w-]+)(?:\s+(.*))?$/s);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: match[2] ?? '' };
}

export function getCommandDefinition(command: string): CommandDefinition | undefined {
  return ALL_COMMANDS.get(command);
}

export function getCommandSuggestions(query: string): CommandDefinition[] {
  const q = query.toLowerCase();
  return COMMANDS.filter(
    (cmd) => cmd.command.startsWith(q) || cmd.aliases.some((a) => a.startsWith(q))
  );
}
