import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Avatar } from '@/app/components/Avatar';
import { useTranslation } from 'react-i18next';
import type { InviteAutocompleteState, UserSuggestion } from './useInviteAutocomplete';
import * as css from './InviteAutocompleteDropdown.css';

interface Props {
  state: InviteAutocompleteState;
  client: MatrixClient;
  maxRecent?: number;
  onSelect: (suggestion: UserSuggestion) => void;
  listId: string;
}

function UserRow({
  suggestion,
  selected,
  client,
  onSelect,
  optionId,
}: {
  suggestion: UserSuggestion;
  selected: boolean;
  client: MatrixClient;
  onSelect: (s: UserSuggestion) => void;
  optionId: string;
}) {
  return (
    <div
      id={optionId}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      className={selected ? css.itemSelected : css.item}
      onClick={() => onSelect(suggestion)}
    >
      <Avatar
        name={suggestion.displayName}
        mxcUrl={suggestion.avatarMxc}
        client={client}
        size="sm"
        placeholder="logo"
      />
      <div className={css.itemInfo}>
        <span className={css.displayName}>{suggestion.displayName}</span>
        <span className={css.userId}>{suggestion.userId}</span>
      </div>
    </div>
  );
}

export function InviteAutocompleteDropdown({
  state,
  client,
  maxRecent = 3,
  onSelect,
  listId,
}: Props) {
  const { t } = useTranslation();
  const recentItems = state.suggestions.filter((s) => s.source === 'recent').slice(0, maxRecent);
  const directoryItems = state.suggestions.filter((s) => s.source === 'directory');

  const hasRecent = recentItems.length > 0;
  const hasDirectory = directoryItems.length > 0;
  const hasAny = hasRecent || hasDirectory || state.loading;

  if (!hasAny) return null;

  // Build a flat ordered list so selectedIndex lines up correctly
  const ordered: UserSuggestion[] = [...recentItems, ...directoryItems];

  return (
    <div className={css.resultsPanel} id={listId} role="listbox">
      {/* Recent section */}
      {hasRecent && (
        <>
          <div className={css.sectionHeader}>
            <span>{t('invite.recent')}</span>
          </div>
          {recentItems.map((s) => {
            const idx = ordered.indexOf(s);
            return (
              <UserRow
                key={s.userId}
                suggestion={s}
                selected={idx === state.selectedIndex}
                client={client}
                onSelect={onSelect}
                optionId={`${listId}-option-${idx}`}
              />
            );
          })}
        </>
      )}

      {/* Directory section */}
      <div className={css.sectionHeader}>
        <span>{t('invite.directory')}</span>
        {state.loading && <span className={css.spinner} />}
      </div>

      {hasDirectory &&
        directoryItems.map((s) => {
          const idx = ordered.indexOf(s);
          return (
            <UserRow
              key={s.userId}
              suggestion={s}
              selected={idx === state.selectedIndex}
              client={client}
              onSelect={onSelect}
              optionId={`${listId}-option-${idx}`}
            />
          );
        })}

      {!hasDirectory && !state.loading && (
        <div className={css.emptyRow}>{t('common.noResults')}</div>
      )}

      {!hasDirectory && state.loading && (
        <div className={css.emptyRow}>{t('common.searching')}</div>
      )}

      {/* Hint */}
      {(hasRecent || hasDirectory) && <div className={css.selectHint}>{t('invite.hint')}</div>}
    </div>
  );
}
