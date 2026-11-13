import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StarIcon } from '@phosphor-icons/react';
import type { WizardClient } from '@wizardchat/core';
import { Tooltip } from '@/app/components/Tooltip';
import { useCoarsePointer } from '@/app/hooks/useCoarsePointer';
import { GIF_FAVOURITES_CAP, useGifFavourites } from '@/app/hooks/useGifFavourites';
import * as css from '../Timeline.css';

interface Props {
  client: WizardClient;
  /** The GIF's own address: an mxc URL on the homeserver, or the provider's. */
  url: string;
}

/** The star on a received GIF that saves it to the picker's favourites. */
export function GifFavouriteButton({ client, url }: Props) {
  const { t } = useTranslation();
  const coarse = useCoarsePointer();
  const { favourites, toggleFavourite } = useGifFavourites(client);
  const fav = favourites.includes(url);
  const full = !fav && favourites.length >= GIF_FAVOURITES_CAP;
  let label = t('composer.addFavourite');
  if (fav) label = t('composer.removeFavourite');
  else if (full) label = t('composer.favouritesFull');

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (full) return;
      toggleFavourite(url);
    },
    [full, toggleFavourite, url]
  );

  return (
    <Tooltip content={label} placement="top">
      <button
        type="button"
        className={css.gifFavouriteBtn}
        data-active={fav}
        data-coarse={coarse}
        aria-disabled={full}
        onClick={handleClick}
        aria-label={label}
      >
        <StarIcon size={14} weight={fav ? 'fill' : 'regular'} />
      </button>
    </Tooltip>
  );
}
