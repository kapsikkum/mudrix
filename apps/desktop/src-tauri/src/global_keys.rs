//! Call keybinds while another app is focused. Combos with a regular key are registered with the
//! system, so they reach only us; a lone modifier or a combo another app holds is watched by
//! reading the key state instead.

use std::{
    collections::HashMap,
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};

use device_query::{DeviceQuery, DeviceState, Keycode};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const POLL: Duration = Duration::from_millis(15);
const RELEASE_DELAY: Duration = Duration::from_millis(120);

#[derive(Default)]
pub struct GlobalKeys {
    watched: Arc<Mutex<Watched>>,
    registered: Mutex<HashMap<String, Shortcut>>,
    presses: Arc<Mutex<HashMap<String, Press>>>,
}

#[derive(Default)]
struct Press {
    down: bool,
    generation: u64,
}

#[derive(Default)]
struct Watched {
    combos: HashMap<String, Combo>,
    running: bool,
}

#[derive(Clone, Serialize)]
struct KeyEvent<'a> {
    id: &'a str,
    down: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum Modifier {
    Ctrl,
    Alt,
    Shift,
    Meta,
}

impl Modifier {
    fn parse(name: &str) -> Option<Self> {
        Some(match name {
            "Ctrl" => Self::Ctrl,
            "Alt" => Self::Alt,
            "Shift" => Self::Shift,
            "Meta" => Self::Meta,
            _ => return None,
        })
    }

    fn keys(self) -> [Keycode; 2] {
        match self {
            Self::Ctrl => [Keycode::LControl, Keycode::RControl],
            Self::Shift => [Keycode::LShift, Keycode::RShift],
            #[cfg(target_os = "macos")]
            Self::Alt => [Keycode::LOption, Keycode::ROption],
            #[cfg(not(target_os = "macos"))]
            Self::Alt => [Keycode::LAlt, Keycode::RAlt],
            #[cfg(target_os = "macos")]
            Self::Meta => [Keycode::Command, Keycode::RCommand],
            #[cfg(not(target_os = "macos"))]
            Self::Meta => [Keycode::LMeta, Keycode::RMeta],
        }
    }

    fn of(key: Keycode) -> Option<Self> {
        [Self::Ctrl, Self::Alt, Self::Shift, Self::Meta]
            .into_iter()
            .find(|modifier| modifier.keys().contains(&key))
    }
}

/// The web app's key combo, `Ctrl+Shift+KeyV` or a lone `ControlRight`
struct Combo {
    key: Keycode,
    modifiers: Vec<Modifier>,
}

impl Combo {
    fn parse(value: &str) -> Option<Self> {
        let mut parts: Vec<&str> = value.split('+').collect();
        let key = keycode(parts.pop()?)?;
        let modifiers = parts.into_iter().filter_map(Modifier::parse).collect();
        Some(Combo { key, modifiers })
    }

    /// Like a keydown in the window: the key goes down while exactly the combo's modifiers are held
    fn starts(&self, keys: &[Keycode]) -> bool {
        let own = Modifier::of(self.key);
        let held: Vec<Modifier> = [
            Modifier::Ctrl,
            Modifier::Alt,
            Modifier::Shift,
            Modifier::Meta,
        ]
        .into_iter()
        .filter(|m| Some(*m) != own && m.keys().iter().any(|k| keys.contains(k)))
        .collect();
        held.len() == self.modifiers.len() && held.iter().all(|m| self.modifiers.contains(m))
    }

    /// Like a keyup: the key or one of the modifiers was released
    fn holds(&self, keys: &[Keycode]) -> bool {
        keys.contains(&self.key)
            && self
                .modifiers
                .iter()
                .all(|m| m.keys().iter().any(|k| keys.contains(k)))
    }
}

/// `KeyboardEvent.code` to the key it names
fn keycode(code: &str) -> Option<Keycode> {
    use Keycode as K;
    if let Some(letter) = code.strip_prefix("Key") {
        const LETTERS: [Keycode; 26] = [
            K::A,
            K::B,
            K::C,
            K::D,
            K::E,
            K::F,
            K::G,
            K::H,
            K::I,
            K::J,
            K::K,
            K::L,
            K::M,
            K::N,
            K::O,
            K::P,
            K::Q,
            K::R,
            K::S,
            K::T,
            K::U,
            K::V,
            K::W,
            K::X,
            K::Y,
            K::Z,
        ];
        let [c] = letter.as_bytes() else { return None };
        return LETTERS.get(c.checked_sub(b'A')? as usize).copied();
    }
    if let Some(digit) = code.strip_prefix("Digit") {
        const DIGITS: [Keycode; 10] = [
            K::Key0,
            K::Key1,
            K::Key2,
            K::Key3,
            K::Key4,
            K::Key5,
            K::Key6,
            K::Key7,
            K::Key8,
            K::Key9,
        ];
        return DIGITS.get(digit.parse::<usize>().ok()?).copied();
    }
    if let Some(digit) = code
        .strip_prefix("Numpad")
        .and_then(|d| d.parse::<usize>().ok())
    {
        const NUMPAD: [Keycode; 10] = [
            K::Numpad0,
            K::Numpad1,
            K::Numpad2,
            K::Numpad3,
            K::Numpad4,
            K::Numpad5,
            K::Numpad6,
            K::Numpad7,
            K::Numpad8,
            K::Numpad9,
        ];
        return NUMPAD.get(digit).copied();
    }
    if let Some(n) = code.strip_prefix('F').and_then(|n| n.parse::<usize>().ok()) {
        const F: [Keycode; 20] = [
            K::F1,
            K::F2,
            K::F3,
            K::F4,
            K::F5,
            K::F6,
            K::F7,
            K::F8,
            K::F9,
            K::F10,
            K::F11,
            K::F12,
            K::F13,
            K::F14,
            K::F15,
            K::F16,
            K::F17,
            K::F18,
            K::F19,
            K::F20,
        ];
        return F.get(n.checked_sub(1)?).copied();
    }
    Some(match code {
        "ControlLeft" => K::LControl,
        "ControlRight" => K::RControl,
        "ShiftLeft" => K::LShift,
        "ShiftRight" => K::RShift,
        "AltLeft" => Modifier::Alt.keys()[0],
        "AltRight" => Modifier::Alt.keys()[1],
        "MetaLeft" => Modifier::Meta.keys()[0],
        "MetaRight" => Modifier::Meta.keys()[1],
        "Escape" => K::Escape,
        "Space" => K::Space,
        "Enter" => K::Enter,
        "Tab" => K::Tab,
        "Backspace" => K::Backspace,
        "CapsLock" => K::CapsLock,
        "ArrowUp" => K::Up,
        "ArrowDown" => K::Down,
        "ArrowLeft" => K::Left,
        "ArrowRight" => K::Right,
        "Home" => K::Home,
        "End" => K::End,
        "PageUp" => K::PageUp,
        "PageDown" => K::PageDown,
        "Insert" => K::Insert,
        "Delete" => K::Delete,
        "NumpadAdd" => K::NumpadAdd,
        "NumpadSubtract" => K::NumpadSubtract,
        "NumpadMultiply" => K::NumpadMultiply,
        "NumpadDivide" => K::NumpadDivide,
        "NumpadDecimal" => K::NumpadDecimal,
        "NumpadEqual" => K::NumpadEquals,
        "NumpadEnter" => K::NumpadEnter,
        "Backquote" => K::Grave,
        "Minus" => K::Minus,
        "Equal" => K::Equal,
        "BracketLeft" => K::LeftBracket,
        "BracketRight" => K::RightBracket,
        "Backslash" => K::BackSlash,
        "Semicolon" => K::Semicolon,
        "Quote" => K::Apostrophe,
        "Comma" => K::Comma,
        "Period" => K::Dot,
        "Slash" => K::Slash,
        _ => return None,
    })
}

/// macOS only lets an app read the keyboard while another app is focused with the Accessibility permission
fn permitted(prompt: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        use macos_accessibility_client::accessibility;
        if prompt {
            accessibility::application_is_trusted_with_prompt()
        } else {
            accessibility::application_is_trusted()
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = prompt;
        true
    }
}

#[derive(Default)]
struct KeyState {
    was_down: bool,
    pressed: bool,
    released_at: Option<Instant>,
}

fn watch(app: AppHandle, watched: Arc<Mutex<Watched>>, device: DeviceState) {
    let mut states: HashMap<String, KeyState> = HashMap::new();
    loop {
        let keys = device.get_keys();
        let now = Instant::now();
        {
            let mut watched = watched.lock().unwrap();
            states.retain(|id, state| {
                let kept = watched.combos.contains_key(id);
                if !kept && state.pressed {
                    let _ = app.emit("global-key", KeyEvent { id, down: false });
                }
                kept
            });
            if watched.combos.is_empty() {
                watched.running = false;
                return;
            }
            for (id, combo) in &watched.combos {
                let state = states.entry(id.clone()).or_default();
                let down = keys.contains(&combo.key);
                if state.pressed {
                    if combo.holds(&keys) {
                        state.released_at = None;
                    } else if let Some(at) = state.released_at {
                        if now.duration_since(at) >= RELEASE_DELAY {
                            state.pressed = false;
                            state.released_at = None;
                            let _ = app.emit("global-key", KeyEvent { id, down: false });
                        }
                    } else {
                        state.released_at = Some(now);
                    }
                } else if down && !state.was_down && combo.starts(&keys) {
                    state.pressed = true;
                    let _ = app.emit("global-key", KeyEvent { id, down: true });
                }
                state.was_down = down;
            }
        }
        std::thread::sleep(POLL);
    }
}

fn system_hotkey(value: &str) -> Option<Shortcut> {
    let mut parts: Vec<&str> = value.split('+').collect();
    let key: Code = parts.pop()?.parse().ok()?;
    if matches!(
        key,
        Code::ControlLeft
            | Code::ControlRight
            | Code::ShiftLeft
            | Code::ShiftRight
            | Code::AltLeft
            | Code::AltRight
            | Code::MetaLeft
            | Code::MetaRight
    ) {
        return None;
    }
    let mut modifiers = Modifiers::empty();
    for part in parts {
        modifiers |= match part {
            "Ctrl" => Modifiers::CONTROL,
            "Alt" => Modifiers::ALT,
            "Shift" => Modifiers::SHIFT,
            "Meta" => Modifiers::META,
            _ => return None,
        };
    }
    Some(Shortcut::new(Some(modifiers), key))
}

fn register(app: &AppHandle, keys: &GlobalKeys, id: &str, shortcut: Shortcut) -> bool {
    let presses = keys.presses.clone();
    let name = id.to_owned();
    let registered = app
        .global_shortcut()
        .on_shortcut(shortcut, move |app, _, event| {
            let mut all = presses.lock().unwrap();
            let press = all.entry(name.clone()).or_default();
            press.generation += 1;
            match event.state {
                ShortcutState::Pressed if !press.down => {
                    press.down = true;
                    let _ = app.emit(
                        "global-key",
                        KeyEvent {
                            id: &name,
                            down: true,
                        },
                    );
                }
                ShortcutState::Released if press.down => {
                    let generation = press.generation;
                    let (app, presses, name) = (app.clone(), presses.clone(), name.clone());
                    std::thread::spawn(move || {
                        std::thread::sleep(RELEASE_DELAY);
                        let mut all = presses.lock().unwrap();
                        if let Some(press) = all.get_mut(&name) {
                            if press.down && press.generation == generation {
                                press.down = false;
                                let _ = app.emit(
                                    "global-key",
                                    KeyEvent {
                                        id: &name,
                                        down: false,
                                    },
                                );
                            }
                        }
                    });
                }
                _ => {}
            }
        });
    if registered.is_err() {
        return false;
    }
    keys.registered
        .lock()
        .unwrap()
        .insert(id.to_owned(), shortcut);
    true
}

fn unregister(app: &AppHandle, keys: &GlobalKeys, id: &str) {
    if let Some(shortcut) = keys.registered.lock().unwrap().remove(id) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
    let press = keys.presses.lock().unwrap().remove(id);
    if press.is_some_and(|press| press.down) {
        let _ = app.emit("global-key", KeyEvent { id, down: false });
    }
    keys.watched.lock().unwrap().combos.remove(id);
}

fn watch_key_state(app: AppHandle, keys: &GlobalKeys, id: String, code: &str) -> &'static str {
    let Some(combo) = Combo::parse(code) else {
        return "unsupported";
    };
    // Wayland doesn't let apps read the keyboard of other apps
    if cfg!(target_os = "linux") && std::env::var("XDG_SESSION_TYPE").is_ok_and(|s| s == "wayland")
    {
        return "unsupported";
    }
    if !permitted(false) {
        return "no-permission";
    }
    let mut watched = keys.watched.lock().unwrap();
    if !watched.running {
        let (started, result) = mpsc::channel();
        let shared = keys.watched.clone();
        let spawned = std::thread::Builder::new()
            .name("global-keys".into())
            .spawn(move || {
                let Some(device) = DeviceState::checked_new() else {
                    let _ = started.send(false);
                    return;
                };
                let _ = started.send(true);
                watch(app, shared, device);
            });
        if spawned.is_err() || !result.recv().unwrap_or(false) {
            return "unsupported";
        }
        watched.running = true;
    }
    watched.combos.insert(id, combo);
    "active"
}

#[tauri::command]
pub fn global_key_set(
    app: AppHandle,
    state: State<'_, GlobalKeys>,
    id: String,
    code: Option<String>,
) -> &'static str {
    let keys = state.inner();
    unregister(&app, keys, &id);
    let Some(code) = code.filter(|code| !code.is_empty()) else {
        return "active";
    };
    match system_hotkey(&code) {
        Some(shortcut) if register(&app, keys, &id, shortcut) => "active",
        Some(_) => match watch_key_state(app, keys, id, &code) {
            "active" => "taken",
            status => status,
        },
        None => watch_key_state(app, keys, id, &code),
    }
}

#[tauri::command]
pub fn global_keys_permission(prompt: bool) -> bool {
    permitted(prompt)
}
