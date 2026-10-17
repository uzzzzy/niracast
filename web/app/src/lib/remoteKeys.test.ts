import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeRemoteKey, type RemoteAction, registerTizenKeys } from './remoteKeys';

describe('normalizeRemoteKey table', () => {
  const cases: Array<{
    name: string;
    input: { key?: string; keyCode?: number; which?: number; code?: string };
    expectedAction: RemoteAction;
    expectedDigit?: number;
  }> = [
    // Standard D-pad and Confirmation
    { name: 'ArrowUp', input: { key: 'ArrowUp' }, expectedAction: 'up' },
    { name: 'ArrowDown', input: { key: 'ArrowDown' }, expectedAction: 'down' },
    { name: 'ArrowLeft', input: { key: 'ArrowLeft' }, expectedAction: 'left' },
    { name: 'ArrowRight', input: { key: 'ArrowRight' }, expectedAction: 'right' },
    { name: 'Enter', input: { key: 'Enter' }, expectedAction: 'ok' },
    { name: 'Select', input: { key: 'Select' }, expectedAction: 'ok' },
    { name: 'Escape', input: { key: 'Escape' }, expectedAction: 'back' },
    { name: 'Backspace', input: { key: 'Backspace' }, expectedAction: 'back' },
    { name: 'PageUp', input: { key: 'PageUp' }, expectedAction: 'channelUp' },
    { name: 'PageDown', input: { key: 'PageDown' }, expectedAction: 'channelDown' },
    { name: 'ChannelUp', input: { key: 'ChannelUp' }, expectedAction: 'channelUp' },
    { name: 'ChannelDown', input: { key: 'ChannelDown' }, expectedAction: 'channelDown' },
    { name: 'MediaPlayPause', input: { key: 'MediaPlayPause' }, expectedAction: 'playPause' },
    { name: 'MediaPlay', input: { key: 'MediaPlay' }, expectedAction: 'play' },
    { name: 'MediaPause', input: { key: 'MediaPause' }, expectedAction: 'pause' },
    { name: 'MediaStop', input: { key: 'MediaStop' }, expectedAction: 'stop' },
    { name: 'Info', input: { key: 'Info' }, expectedAction: 'info' },
    { name: 'Guide', input: { key: 'Guide' }, expectedAction: 'guide' },

    // Digits
    { name: 'Digit key 5', input: { key: '5' }, expectedAction: 'digit', expectedDigit: 5 },
    {
      name: 'Digit keyCode 48 (0)',
      input: { keyCode: 48 },
      expectedAction: 'digit',
      expectedDigit: 0,
    },
    {
      name: 'Numpad keyCode 105 (9)',
      input: { keyCode: 105 },
      expectedAction: 'digit',
      expectedDigit: 9,
    },
    {
      name: 'Android TV KEYCODE_7 (0)',
      input: { keyCode: 7 },
      expectedAction: 'digit',
      expectedDigit: 0,
    },
    {
      name: 'Android TV KEYCODE_11 (4)',
      input: { keyCode: 11 },
      expectedAction: 'digit',
      expectedDigit: 4,
    },

    // Tizen Legacy keyCodes
    { name: 'Tizen Back (10009)', input: { keyCode: 10009 }, expectedAction: 'back' },
    { name: 'Tizen ChannelUp (427)', input: { keyCode: 427 }, expectedAction: 'channelUp' },
    { name: 'Tizen ChannelDown (428)', input: { keyCode: 428 }, expectedAction: 'channelDown' },
    { name: 'Tizen MediaPlay (415)', input: { keyCode: 415 }, expectedAction: 'play' },
    { name: 'Tizen MediaPause (19)', input: { keyCode: 19 }, expectedAction: 'pause' },
    {
      name: 'Tizen MediaPlayPause (10252)',
      input: { keyCode: 10252 },
      expectedAction: 'playPause',
    },
    { name: 'Tizen MediaStop (413)', input: { keyCode: 413 }, expectedAction: 'stop' },

    // webOS Legacy keyCodes
    { name: 'webOS Back (461)', input: { keyCode: 461 }, expectedAction: 'back' },
    { name: 'webOS ChannelUp / PageUp (33)', input: { keyCode: 33 }, expectedAction: 'channelUp' },
    {
      name: 'webOS ChannelDown / PageDown (34)',
      input: { keyCode: 34 },
      expectedAction: 'channelDown',
    },

    // Android TV Legacy keyCodes
    { name: 'Android TV Back (4)', input: { keyCode: 4 }, expectedAction: 'back' },
    { name: 'Android TV ChannelUp (166)', input: { keyCode: 166 }, expectedAction: 'channelUp' },
    {
      name: 'Android TV ChannelDown (167)',
      input: { keyCode: 167 },
      expectedAction: 'channelDown',
    },
    { name: 'Android TV PlayPause (85)', input: { keyCode: 85 }, expectedAction: 'playPause' },
    { name: 'Android TV Info (165)', input: { keyCode: 165 }, expectedAction: 'info' },
    { name: 'Android TV Guide (172)', input: { keyCode: 172 }, expectedAction: 'guide' },
  ];

  for (const c of cases) {
    it(`normalizes ${c.name} to ${c.expectedAction}${c.expectedDigit !== undefined ? ` (${c.expectedDigit})` : ''}`, () => {
      const res = normalizeRemoteKey(c.input);
      expect(res).not.toBeNull();
      expect(res?.action).toBe(c.expectedAction);
      if (c.expectedDigit !== undefined) {
        expect(res?.digit).toBe(c.expectedDigit);
      }
    });
  }

  it('returns null for unmapped keys', () => {
    expect(normalizeRemoteKey({ key: 'F12' })).toBeNull();
    expect(normalizeRemoteKey({ keyCode: 9999 })).toBeNull();
  });
});

describe('registerTizenKeys', () => {
  afterEach(() => {
    delete (window as unknown as { tizen?: unknown }).tizen;
  });

  it('safely no-ops when window.tizen does not exist', () => {
    expect(() => registerTizenKeys()).not.toThrow();
  });

  it('calls tizen.tvinputdevice.registerKey for required TV keys when API exists', () => {
    const registerMock = vi.fn();
    (
      window as unknown as { tizen: { tvinputdevice: { registerKey: typeof registerMock } } }
    ).tizen = {
      tvinputdevice: {
        registerKey: registerMock,
      },
    };

    registerTizenKeys();

    expect(registerMock).toHaveBeenCalledWith('MediaPlay');
    expect(registerMock).toHaveBeenCalledWith('MediaPause');
    expect(registerMock).toHaveBeenCalledWith('MediaPlayPause');
    expect(registerMock).toHaveBeenCalledWith('MediaStop');
    expect(registerMock).toHaveBeenCalledWith('ChannelUp');
    expect(registerMock).toHaveBeenCalledWith('ChannelDown');
    expect(registerMock).toHaveBeenCalledWith('Info');
    expect(registerMock).toHaveBeenCalledWith('Guide');
  });
});
