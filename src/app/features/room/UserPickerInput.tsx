import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatrixClient } from 'matrix-js-sdk';
import { Input } from '@/app/components/Input';
import { useInviteAutocomplete, type UserSuggestion } from './useInviteAutocomplete';
import { InviteAutocompleteDropdown } from './InviteAutocompleteDropdown';

const MAX_RECENT_SHOWN = 3;

interface UserPickerInputProps {
  client: MatrixClient;
  value: string;
  onValueChange: (value: string) => void;
  onPick: (suggestion: UserSuggestion) => void;
  onSubmit: () => void;
  label: string;
  helperText?: string;
  autoFocus?: boolean;
  suggestOnFocus?: boolean;
  excludeUserIds?: ReadonlySet<string>;
}

export function UserPickerInput({
  client,
  value,
  onValueChange,
  onPick,
  onSubmit,
  label,
  helperText,
  autoFocus,
  suggestOnFocus,
  excludeUserIds,
}: UserPickerInputProps) {
  const { t } = useTranslation();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const autocomplete = useInviteAutocomplete(client);
  const { open: openAutocomplete } = autocomplete;

  useEffect(() => {
    if (!suggestOnFocus) openAutocomplete();
  }, [suggestOnFocus, openAutocomplete]);

  const allowed = autocomplete.state.suggestions.filter((s) => !excludeUserIds?.has(s.userId));
  const suggestions = [
    ...allowed.filter((s) => s.source === 'recent').slice(0, MAX_RECENT_SHOWN),
    ...allowed.filter((s) => s.source === 'directory'),
  ];
  const state = {
    ...autocomplete.state,
    suggestions,
    selectedIndex: Math.min(autocomplete.state.selectedIndex, Math.max(suggestions.length - 1, 0)),
  };
  const visible =
    (!suggestOnFocus || focused) && state.open && (state.suggestions.length > 0 || state.loading);

  const pick = (suggestion: UserSuggestion) => {
    onPick(suggestion);
    autocomplete.close();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      autocomplete.onArrow(e.key === 'ArrowDown' ? 'down' : 'up');
    } else if (e.key === 'Escape' && visible) {
      e.preventDefault();
      e.stopPropagation();
      autocomplete.close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const selected = visible ? state.suggestions[state.selectedIndex] : undefined;
      if (selected) pick(selected);
      else onSubmit();
    }
  };

  return (
    <>
      <Input
        label={label}
        helperText={helperText}
        placeholder={t('invite.userIdPlaceholder')}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          autocomplete.onInput(e.target.value);
        }}
        onFocus={() => {
          setFocused(true);
          if (suggestOnFocus && !value) openAutocomplete();
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        data-dialog-autofocus={autoFocus || undefined}
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={visible ? `${listId}-option-${state.selectedIndex}` : undefined}
      />
      {visible && (
        <div onMouseDown={(e) => e.preventDefault()}>
          <InviteAutocompleteDropdown
            state={state}
            client={client}
            maxRecent={MAX_RECENT_SHOWN}
            onSelect={pick}
            listId={listId}
          />
        </div>
      )}
    </>
  );
}
