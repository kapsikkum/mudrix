import { useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { settingsOpenAtom, settingsPageAtom } from '@/app/store/atoms';
import { NarrowSettingsList } from '@/app/components/Settings/NarrowSettings';
import { AccountSwitcher } from './AccountSwitcher';
import { useSettingsNav } from './Settings';
import * as css from './Settings.css';

export function MobileSettingsHome() {
  const items = useSettingsNav();
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const navigate = useNavigate();

  return (
    <NarrowSettingsList
      items={items}
      onSelect={(page) => {
        setSettingsPage(page);
        setSettingsOpen(true);
      }}
      footer={
        <div className={css.navListFooter}>
          <AccountSwitcher onAddAccount={() => navigate('/welcome?add=1')} />
        </div>
      }
    />
  );
}
