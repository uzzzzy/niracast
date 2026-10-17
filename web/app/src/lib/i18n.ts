export type Language = 'id' | 'en';

export const translations = {
  id: {
    loading_broadcast: 'Memuat siaran...',
    loading_channel: 'Memuat saluran...',
    channel_not_found: 'Saluran Tidak Ditemukan',
    channel_not_found_desc: 'Saluran yang diminta tidak ada atau tidak dapat dimuat.',
    back_to_channels: 'Kembali ke Saluran',
    live: 'LIVE',
    idle: 'IDLE',
    idle_title: 'Siaran Segera Kembali',
    standby: 'Siaga',
    reconnecting: 'Menghubungkan ulang...',
    tap_to_unmute: 'Ketuk untuk membunyikan',
    now_playing: 'Sedang Tayang',
    next: 'Berikutnya',
    in: 'dalam',
    program_guide: 'Panduan Acara',
    channels: 'Daftar Saluran',
    close: 'Tutup',
    mute: 'Bisukan',
    unmute: 'Bunyikan',
    volume: 'Volume',
    fullscreen: 'Layar Penuh',
    exit_fullscreen: 'Keluar Layar Penuh',
    pip: 'Picture in Picture',
    retry: 'Coba Lagi',
    playback_error: 'Terjadi kesalahan pemutaran',
    buffering: 'Memuat buffer...',
    shortcuts_title: 'Pintasan Papan Ketik',
    shortcuts_m: 'Bisukan / bunyikan audio',
    shortcuts_f: 'Layar penuh',
    shortcuts_p: 'Picture-in-picture',
    shortcuts_g: 'Buka/tutup panduan acara',
    shortcuts_c: 'Buka/tutup daftar saluran',
    shortcuts_up_down: 'Saluran sebelumnya / berikutnya',
    shortcuts_digits: 'Lompat ke saluran 1-9',
    shortcuts_esc: 'Tutup panel',
    shortcuts_help: 'Bantuan pintasan',
    now: 'Sekarang',
    no_epg: 'Tidak ada jadwal acara',
  },
  en: {
    loading_broadcast: 'Loading broadcast...',
    loading_channel: 'Loading channel...',
    channel_not_found: 'Channel Not Found',
    channel_not_found_desc: 'The requested channel does not exist or could not be loaded.',
    back_to_channels: 'Back to Channels',
    live: 'LIVE',
    idle: 'IDLE',
    idle_title: "We'll be right back",
    standby: 'Standby',
    reconnecting: 'Reconnecting...',
    tap_to_unmute: 'Tap to unmute',
    now_playing: 'Now Playing',
    next: 'Next',
    in: 'in',
    program_guide: 'Program Guide',
    channels: 'Channels',
    close: 'Close',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    fullscreen: 'Fullscreen',
    exit_fullscreen: 'Exit Fullscreen',
    pip: 'Picture in Picture',
    retry: 'Retry',
    playback_error: 'Playback error occurred',
    buffering: 'Buffering...',
    shortcuts_title: 'Keyboard Shortcuts',
    shortcuts_m: 'Toggle mute audio',
    shortcuts_f: 'Toggle fullscreen',
    shortcuts_p: 'Toggle picture-in-picture',
    shortcuts_g: 'Toggle program guide',
    shortcuts_c: 'Toggle channels list',
    shortcuts_up_down: 'Previous / next channel',
    shortcuts_digits: 'Jump to channel 1-9',
    shortcuts_esc: 'Close open panel',
    shortcuts_help: 'Keyboard shortcuts',
    now: 'Now',
    no_epg: 'No schedule available',
  },
} as const;

export type TranslationKey = keyof (typeof translations)['id'];

export function getLanguage(): Language {
  if (typeof window === 'undefined') {
    return 'id';
  }

  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'id' || saved === 'en') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    const navLang = navigator.language.toLowerCase();
    if (navLang.startsWith('en')) {
      return 'en';
    }
    if (navLang.startsWith('id')) {
      return 'id';
    }
  }

  return 'id';
}

export function t(key: TranslationKey, lang?: string): string {
  let targetLang: Language;
  if (lang) {
    targetLang = lang === 'en' ? 'en' : 'id';
  } else {
    targetLang = getLanguage();
  }
  const dict = translations[targetLang] || translations.id;
  return dict[key] ?? translations.id[key] ?? key;
}
