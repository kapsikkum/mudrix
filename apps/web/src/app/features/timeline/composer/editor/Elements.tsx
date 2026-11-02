import { createContext, useContext } from 'react';
import type { RenderElementProps, RenderLeafProps } from 'slate-react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import type { CustomElement, CustomText, EmoticonElement, RoomMentionElement } from './types';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';

export const MatrixClientContext = createContext<MatrixClient | null>(null);

export function Element({ attributes, children, element }: RenderElementProps) {
  const el = element as CustomElement;
  const client = useContext(MatrixClientContext);

  switch (el.type) {
    case 'block-quote':
      return <blockquote {...attributes}>{children}</blockquote>;

    case 'code-block':
      return (
        <pre {...attributes}>
          <code>{children}</code>
        </pre>
      );

    case 'link':
      return (
        <a
          {...attributes}
          href={el.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.preventDefault()}
        >
          {children}
        </a>
      );

    case 'mention':
      return (
        <span
          {...attributes}
          contentEditable={false}
          className="mention-pill"
          data-user-id={el.userId}
        >
          @{el.displayName}
          {children}
        </span>
      );

    case 'room-mention': {
      const rm = el as RoomMentionElement;
      return (
        <span
          {...attributes}
          contentEditable={false}
          className="mention-pill room-mention-pill"
          data-room-mention={rm.label}
        >
          {rm.label}
          {children}
        </span>
      );
    }

    case 'emoticon': {
      const e = el as EmoticonElement;
      return (
        <span
          {...attributes}
          contentEditable={false}
          style={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <AuthMediaImg
            client={client}
            mxcUrl={e.mxcUrl}
            width={32}
            height={32}
            alt={`:${e.shortcode}:`}
            title={e.shortcode}
            style={{ display: 'inline', verticalAlign: 'middle', height: 20 }}
          />
          {children}
        </span>
      );
    }

    default:
      return <p {...attributes}>{children}</p>;
  }
}

export function Leaf({ attributes, children, leaf }: RenderLeafProps) {
  const text = leaf as CustomText;
  let node = children;

  if (text.bold) node = <strong>{node}</strong>;
  if (text.italic) node = <em>{node}</em>;
  if (text.strikethrough) node = <s>{node}</s>;
  if (text.code) node = <code>{node}</code>;

  return <span {...attributes}>{node}</span>;
}
