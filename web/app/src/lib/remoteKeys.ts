/**
 * Remote Control Key Normalization and Tizen Key Registration.
 *
 * Normalizes standard D-pad and media keys along with Smart TV legacy keycodes
 * across Tizen (Samsung), webOS (LG), and Android TV / Fire TV.
 */

export type RemoteAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ok'
  | 'back'
  | 'channelUp'
  | 'channelDown'
  | 'play'
  | 'pause'
  | 'playPause'
  | 'stop'
  | 'info'
  | 'guide'
  | 'digit';

export interface NormalizedRemoteEvent {
  action: RemoteAction;
  digit?: number;
  rawKey?: string;
  rawKeyCode?: number;
}

export interface RemoteKeyEventLike {
  key?: string;
  keyCode?: number;
  which?: number;
  code?: string;
}

/**
 * Standard key mappings for modern TV browsers and keyboard emulation.
 */
const STANDARD_KEY_MAP: Record<string, RemoteAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'ok',
  Select: 'ok',
  Escape: 'back',
  Backspace: 'back',
  GoBack: 'back',
  BrowserBack: 'back',
  PageUp: 'channelUp',
  PageDown: 'channelDown',
  ChannelUp: 'channelUp',
  ChannelDown: 'channelDown',
  MediaPlayPause: 'playPause',
  MediaPlay: 'play',
  MediaPause: 'pause',
  MediaStop: 'stop',
  Info: 'info',
  Guide: 'guide',
};

/**
 * Legacy numeric keyCodes across TV platforms:
 * - Tizen (Samsung)
 * - webOS (LG)
 * - Android TV / Fire TV (Google)
 */
const LEGACY_KEYCODE_MAP: Record<number, RemoteAction> = {
  // Navigation / Confirmation / Back
  13: 'ok', // Enter
  27: 'back', // Escape
  8: 'back', // Backspace
  38: 'up', // ArrowUp
  40: 'down', // ArrowDown
  37: 'left', // ArrowLeft
  39: 'right', // ArrowRight

  // Tizen Legacy
  10009: 'back', // Tizen RETURN / BACK
  427: 'channelUp', // Tizen CHANNEL_UP
  428: 'channelDown', // Tizen CHANNEL_DOWN
  415: 'play', // Tizen MEDIA_PLAY
  19: 'pause', // Tizen / Standard PAUSE
  10252: 'playPause', // Tizen MEDIA_PLAY_PAUSE
  413: 'stop', // Tizen MEDIA_STOP
  457: 'info', // Tizen INFO
  458: 'guide', // Tizen GUIDE

  // webOS Legacy
  461: 'back', // webOS BACK
  33: 'channelUp', // webOS ChannelUp / PageUp
  34: 'channelDown', // webOS ChannelDown / PageDown

  // Android TV / AOSP KeyCodes
  4: 'back', // KEYCODE_BACK
  166: 'channelUp', // KEYCODE_CHANNEL_UP
  167: 'channelDown', // KEYCODE_CHANNEL_DOWN
  85: 'playPause', // KEYCODE_MEDIA_PLAY_PAUSE
  126: 'play', // KEYCODE_MEDIA_PLAY
  127: 'pause', // KEYCODE_MEDIA_PAUSE
  86: 'stop', // KEYCODE_MEDIA_STOP
  165: 'info', // KEYCODE_INFO
  172: 'guide', // KEYCODE_GUIDE
};

/**
 * Normalizes a keyboard or remote control keydown event to a semantic RemoteAction.
 */
export function normalizeRemoteKey(e: RemoteKeyEventLike): NormalizedRemoteEvent | null {
  const key = e.key;
  const keyCode = e.keyCode ?? e.which;

  // 1. Check for single digit keys ('0'-'9')
  if (key && /^[0-9]$/.test(key)) {
    return {
      action: 'digit',
      digit: Number.parseInt(key, 10),
      rawKey: key,
      rawKeyCode: keyCode,
    };
  }

  // Check digit keyCode (ASCII 48-57: '0'-'9')
  if (typeof keyCode === 'number' && keyCode >= 48 && keyCode <= 57) {
    return {
      action: 'digit',
      digit: keyCode - 48,
      rawKey: key,
      rawKeyCode: keyCode,
    };
  }

  // Check numpad keyCode (ASCII 96-105: '0'-'9')
  if (typeof keyCode === 'number' && keyCode >= 96 && keyCode <= 105) {
    return {
      action: 'digit',
      digit: keyCode - 96,
      rawKey: key,
      rawKeyCode: keyCode,
    };
  }

  // Check Android TV digit keyCodes (KEYCODE_0 = 7 through KEYCODE_9 = 16)
  if (typeof keyCode === 'number' && keyCode >= 7 && keyCode <= 16) {
    return {
      action: 'digit',
      digit: keyCode - 7,
      rawKey: key,
      rawKeyCode: keyCode,
    };
  }

  // 2. Check standard key string
  if (key && STANDARD_KEY_MAP[key]) {
    return {
      action: STANDARD_KEY_MAP[key],
      rawKey: key,
      rawKeyCode: keyCode,
    };
  }

  // 3. Check legacy keyCode map
  if (typeof keyCode === 'number' && LEGACY_KEYCODE_MAP[keyCode]) {
    return {
      action: LEGACY_KEYCODE_MAP[keyCode],
      rawKey: key,
      rawKeyCode: keyCode,
    };
  }

  return null;
}

/**
 * On Samsung Tizen TVs, certain remote keys (Media, Channel, Info, Guide)
 * are swallowed by the TV firmware unless explicitly registered via
 * tizen.tvinputdevice.registerKey.
 *
 * Guarded against non-Tizen environments; safely no-ops everywhere else.
 */
export function registerTizenKeys(): void {
  try {
    if (typeof window === 'undefined') return;
    const tizenObj = (
      window as unknown as {
        tizen?: {
          tvinputdevice?: {
            registerKey?: (keyName: string) => void;
          };
        };
      }
    ).tizen;

    if (tizenObj?.tvinputdevice?.registerKey) {
      const keys = [
        'MediaPlay',
        'MediaPause',
        'MediaPlayPause',
        'MediaStop',
        'ChannelUp',
        'ChannelDown',
        'Info',
        'Guide',
      ];

      for (const k of keys) {
        try {
          tizenObj.tvinputdevice.registerKey(k);
        } catch {
          // Ignore registration failures for keys unsupported by specific hardware
        }
      }
    }
  } catch {
    // Guarded, strictly no-op
  }
}
