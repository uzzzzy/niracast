import { useCallback, useEffect, useState } from 'react';

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
    shortcuts_n: 'Ganti mode gerakan (Otomatis/Penuh/Ringan)',
    motion_label: 'Gerakan',
    motion_auto: 'Otomatis',
    motion_full: 'Penuh',
    motion_lite: 'Ringan',
    motion_reduced: 'Tereduksi',
    motion_tooltip: 'Mode Gerakan: {mode}',
    now: 'Sekarang',
    no_epg: 'Tidak ada jadwal acara',

    // CMS Studio Auth
    login_title: 'Studio Masuk',
    login_subtitle: 'Masukkan kata sandi administrator untuk mengelola siaran.',
    password_label: 'Kata Sandi',
    password_placeholder: 'Masukkan kata sandi...',
    show_password: 'Tampilkan kata sandi',
    hide_password: 'Sembunyikan kata sandi',
    sign_in: 'Masuk',
    signing_in: 'Memeriksa...',
    invalid_password: 'Kata sandi salah. Silakan coba lagi.',
    rate_limit_error: 'Terlalu banyak percobaan. Coba lagi dalam {sec} detik.',
    rate_limit_fallback: 'Terlalu banyak percobaan masuk. Silakan coba beberapa saat lagi.',
    logout: 'Keluar',
    logging_out: 'Keluar...',
    session_expired: 'Sesi Anda telah berakhir. Silakan masuk kembali.',

    // CMS Studio Shell & Navigation
    studio_title: 'Studio Siaran',
    nav_overview: 'Ringkasan',
    nav_channels: 'Saluran',
    nav_media: 'Pustaka Media',
    nav_system: 'Sistem',
    open_viewer: 'Buka Penampil',
    live_status_connected: 'Live',
    live_status_reconnecting: 'Menghubungkan ulang...',
    language: 'Bahasa',

    // CMS Studio Overview
    overview_title: 'Pemantau Siaran Langsung',
    overview_subtitle: 'Status real-time pemutaran dan siaran seluruh saluran.',
    stat_media_count: 'Total Media',
    stat_total_channels: 'Total Saluran',
    stat_running_channels: 'Saluran Aktif',
    stat_uptime: 'Waktu Aktif',
    badge_playing: 'MEMUTAR',
    badge_idle: 'SIAGA',
    badge_stopped: 'BERHENTI',
    skip_button: 'Lewati',
    skip_confirm: 'Saluran berhasil dilewati.',
    skip_error_not_playing: 'Saluran tidak sedang memutar media.',
    copy_hls_url: 'Salin URL HLS',
    copy_m3u_url: 'Salin M3U',
    copy_epg_url: 'Salin EPG',
    copied_to_clipboard: 'Tautan disalin ke papan klip.',
    feeds_quick_access: 'Tautan Umpan IPTV & EPG',
    remaining: 'tersisa',

    // CMS Studio Channels
    channels_title: 'Manajemen Saluran',
    channels_subtitle: 'Buat, ubah, dan atur saluran serta susunan pemutaran.',
    create_channel: 'Buat Saluran',
    edit_channel: 'Ubah Saluran',
    delete_channel: 'Hapus Saluran',
    channel_number: 'Nomor Saluran',
    channel_name: 'Nama Saluran',
    channel_number_placeholder: 'Misal: 1',
    channel_name_placeholder: 'Misal: Berita 24 Jam',
    manage_playlist: 'Kelola Playlist',
    delete_confirm_title: 'Hapus Saluran?',
    delete_confirm_message:
      'Saluran dan seluruh daftar putar terkait akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.',
    confirm_delete: 'Hapus Saluran',
    cancel: 'Batal',
    save: 'Simpan',
    created_at: 'Dibuat Pada',
    actions: 'Aksi',
    error_number_required: 'Nomor saluran harus berupa angka bulat positif (>= 1).',
    error_name_required: 'Nama saluran harus antara 1 sampai 60 karakter.',
    duplicate_number_error: 'Nomor saluran ini sudah digunakan oleh saluran lain.',
    channel_created: 'Saluran berhasil dibuat.',
    channel_updated: 'Saluran berhasil diperbarui.',
    channel_deleted: 'Saluran berhasil dihapus.',
    channel_delete_failed: 'Gagal menghapus saluran.',
    no_channels: 'Belum ada saluran.',
    no_channels_desc: 'Buat saluran pertama Anda untuk mulai menyiarkan konten.',

    // CMS Studio Playlist Editor
    playlist_editor_title: 'Editor Playlist',
    back_to_channels_list: 'Kembali ke Saluran',
    media_library_pane: 'Pustaka Media',
    playlist_pane: 'Daftar Putar Saluran',
    search_media_placeholder: 'Cari berkas media...',
    add_to_playlist: 'Tambah',
    remove_from_playlist: 'Hapus item',
    unsaved_changes: 'Perubahan belum disimpan',
    save_playlist: 'Simpan Playlist',
    revert_playlist: 'Kembalikan',
    saving_playlist: 'Menyimpan...',
    playlist_saved: 'Daftar putar berhasil disimpan.',
    playlist_save_failed: 'Gagal menyimpan daftar putar.',
    total_duration: 'Total Durasi Loop',
    item_count: 'Jumlah Item',
    empty_playlist: 'Daftar putar kosong',
    empty_playlist_desc:
      'Tambahkan berkas media dari pustaka di sebelah kiri untuk mengisi siaran saluran ini.',
    no_media_found: 'Tidak ada media ditemukan.',
    loop_timeline: 'Garis Waktu Loop',
    warn_unsaved_leave:
      'Anda memiliki perubahan daftar putar yang belum disimpan. Tetap tinggalkan halaman?',

    // CMS Studio Media Library
    media_title: 'Pustaka Berkas Media',
    media_subtitle: 'Daftar berkas video yang tersedia dari direktori /media.',
    rescan_library: 'Pindai Ulang',
    rescanning: 'Memindai...',
    rescan_started: 'Pemindaian berkas media dimulai.',
    rescan_finished: 'Pemindaian berkas selesai.',
    rescan_error: 'Kesalahan pemindaian:',
    search_media: 'Cari media...',
    sort_name_asc: 'Nama (A-Z)',
    sort_name_desc: 'Nama (Z-A)',
    sort_duration_asc: 'Durasi (Terpendek)',
    sort_duration_desc: 'Durasi (Terpanjang)',
    col_filename: 'Nama Berkas',
    col_duration: 'Durasi',
    col_video_codec: 'Codec Video',
    col_audio_codec: 'Codec Audio',
    col_resolution: 'Resolusi',
    no_media_mount: 'Tidak ada berkas media ditemukan',
    media_mount_desc:
      'Pastikan folder video terpasang ke direktori /media di container/server Anda, lalu klik Pindai Ulang.',

    // CMS Studio System
    system_title: 'Status Sistem & Pengaturan',
    system_subtitle: 'Informasi lingkungan siaran FFmpeg, klip siaga, dan umpan IPTV.',
    ffmpeg_info: 'Informasi FFmpeg',
    ffmpeg_path: 'Jalur Biner',
    ffmpeg_version: 'Versi FFmpeg',
    idle_clip_info: 'Klip Video Siaga (Idle Card)',
    idle_clip_status: 'Status Klip',
    idle_clip_ready: 'Siap (Pre-encoded)',
    idle_clip_not_ready: 'Belum Siap',
    idle_clip_size: 'Ukuran Berkas',
    idle_clip_modified: 'Terakhir Diperbarui',
    feeds_info: 'Umpan IPTV & EPG Publik',
    feed_m3u_desc: 'Daftar putar format M3U8 untuk aplikasi pemutar IPTV.',
    feed_epg_desc: 'Jadwal acara XMLTV EPG untuk panduan siaran IPTV.',
    feed_hls_desc: 'Contoh siaran langsung HLS untuk saluran 1.',
    copy_url: 'Salin URL',
    stat_uptime_days: 'hari',
    stat_uptime_hours: 'jam',
    stat_uptime_mins: 'menit',
    stat_uptime_secs: 'detik',
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
    shortcuts_n: 'Cycle motion mode (Auto/Full/Lite)',
    motion_label: 'Motion',
    motion_auto: 'Auto',
    motion_full: 'Full',
    motion_lite: 'Lite',
    motion_reduced: 'Reduced',
    motion_tooltip: 'Motion Mode: {mode}',
    now: 'Now',
    no_epg: 'No schedule available',

    // CMS Studio Auth
    login_title: 'Studio Login',
    login_subtitle: 'Enter administrator password to manage broadcast.',
    password_label: 'Password',
    password_placeholder: 'Enter password...',
    show_password: 'Show password',
    hide_password: 'Hide password',
    sign_in: 'Sign In',
    signing_in: 'Signing in...',
    invalid_password: 'Invalid password. Please try again.',
    rate_limit_error: 'Too many attempts. Try again in {sec} seconds.',
    rate_limit_fallback: 'Too many login attempts. Please try again shortly.',
    logout: 'Log out',
    logging_out: 'Logging out...',
    session_expired: 'Your session has expired. Please sign in again.',

    // CMS Studio Shell & Navigation
    studio_title: 'Broadcast Studio',
    nav_overview: 'Overview',
    nav_channels: 'Channels',
    nav_media: 'Media Library',
    nav_system: 'System',
    open_viewer: 'Open Viewer',
    live_status_connected: 'Live',
    live_status_reconnecting: 'Reconnecting...',
    language: 'Language',

    // CMS Studio Overview
    overview_title: 'Live Playout Monitor',
    overview_subtitle: 'Real-time playout status across all channels.',
    stat_media_count: 'Media Files',
    stat_total_channels: 'Total Channels',
    stat_running_channels: 'Active Playouts',
    stat_uptime: 'System Uptime',
    badge_playing: 'PLAYING',
    badge_idle: 'IDLE',
    badge_stopped: 'STOPPED',
    skip_button: 'Skip',
    skip_confirm: 'Channel skipped successfully.',
    skip_error_not_playing: 'Channel is not playing media.',
    copy_hls_url: 'Copy HLS URL',
    copy_m3u_url: 'Copy M3U',
    copy_epg_url: 'Copy EPG',
    copied_to_clipboard: 'Link copied to clipboard.',
    feeds_quick_access: 'IPTV & EPG Feed Links',
    remaining: 'remaining',

    // CMS Studio Channels
    channels_title: 'Channel Management',
    channels_subtitle: 'Create, edit, and organize channels and playlists.',
    create_channel: 'Create Channel',
    edit_channel: 'Edit Channel',
    delete_channel: 'Delete Channel',
    channel_number: 'Channel Number',
    channel_name: 'Channel Name',
    channel_number_placeholder: 'e.g. 1',
    channel_name_placeholder: 'e.g. 24h News',
    manage_playlist: 'Manage Playlist',
    delete_confirm_title: 'Delete Channel?',
    delete_confirm_message:
      'The channel and its entire playlist will be permanently removed. This action cannot be undone.',
    confirm_delete: 'Delete Channel',
    cancel: 'Cancel',
    save: 'Save',
    created_at: 'Created At',
    actions: 'Actions',
    error_number_required: 'Channel number must be an integer (>= 1).',
    error_name_required: 'Channel name must be between 1 and 60 characters.',
    duplicate_number_error: 'Channel number is already in use by another channel.',
    channel_created: 'Channel created successfully.',
    channel_updated: 'Channel updated successfully.',
    channel_deleted: 'Channel deleted successfully.',
    channel_delete_failed: 'Failed to delete channel.',
    no_channels: 'No channels yet.',
    no_channels_desc: 'Create your first channel to start broadcasting content.',

    // CMS Studio Playlist Editor
    playlist_editor_title: 'Playlist Editor',
    back_to_channels_list: 'Back to Channels',
    media_library_pane: 'Media Library',
    playlist_pane: 'Channel Playlist',
    search_media_placeholder: 'Search media files...',
    add_to_playlist: 'Add',
    remove_from_playlist: 'Remove item',
    unsaved_changes: 'Unsaved changes',
    save_playlist: 'Save Changes',
    revert_playlist: 'Revert',
    saving_playlist: 'Saving...',
    playlist_saved: 'Playlist saved successfully.',
    playlist_save_failed: 'Failed to save playlist.',
    total_duration: 'Total Loop Duration',
    item_count: 'Item Count',
    empty_playlist: 'Empty playlist',
    empty_playlist_desc: 'Add media files from the library on the left to populate this channel.',
    no_media_found: 'No media found.',
    loop_timeline: 'Loop Timeline',
    warn_unsaved_leave: 'You have unsaved playlist changes. Are you sure you want to leave?',

    // CMS Studio Media Library
    media_title: 'Media File Library',
    media_subtitle: 'List of video files available from the /media mount.',
    rescan_library: 'Rescan',
    rescanning: 'Scanning...',
    rescan_started: 'Media library rescan started.',
    rescan_finished: 'Media scan finished.',
    rescan_error: 'Scan error:',
    search_media: 'Search media...',
    sort_name_asc: 'Name (A-Z)',
    sort_name_desc: 'Name (Z-A)',
    sort_duration_asc: 'Duration (Shortest)',
    sort_duration_desc: 'Duration (Longest)',
    col_filename: 'Filename',
    col_duration: 'Duration',
    col_video_codec: 'Video Codec',
    col_audio_codec: 'Audio Codec',
    col_resolution: 'Resolution',
    no_media_mount: 'No media files found',
    media_mount_desc:
      'Ensure your video directory is mounted to /media on your container/server, then click Rescan.',

    // CMS Studio System
    system_title: 'System Status & Feeds',
    system_subtitle: 'FFmpeg playout environment, idle standby card, and IPTV feeds.',
    ffmpeg_info: 'FFmpeg Information',
    ffmpeg_path: 'Binary Path',
    ffmpeg_version: 'FFmpeg Version',
    idle_clip_info: 'Idle Standby Video Card',
    idle_clip_status: 'Clip Status',
    idle_clip_ready: 'Ready (Pre-encoded)',
    idle_clip_not_ready: 'Not Ready',
    idle_clip_size: 'File Size',
    idle_clip_modified: 'Last Modified',
    feeds_info: 'Public IPTV & EPG Feeds',
    feed_m3u_desc: 'M3U8 playlist for IPTV player applications.',
    feed_epg_desc: 'XMLTV EPG schedule for electronic program guide.',
    feed_hls_desc: 'Sample HLS live stream endpoint for Channel 1.',
    copy_url: 'Copy URL',
    stat_uptime_days: 'days',
    stat_uptime_hours: 'hours',
    stat_uptime_mins: 'mins',
    stat_uptime_secs: 'secs',
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

export function setLanguage(lang: Language): void {
  try {
    localStorage.setItem('lang', lang);
  } catch {
    // Ignore storage errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tvstream-lang-change', { detail: lang }));
  }
}

export function t(
  key: TranslationKey,
  lang?: string,
  params?: Record<string, string | number>,
): string {
  let targetLang: Language;
  if (lang) {
    targetLang = lang === 'en' ? 'en' : 'id';
  } else {
    targetLang = getLanguage();
  }
  const dict = translations[targetLang] || translations.id;
  let text = dict[key] ?? translations.id[key] ?? key;

  if (params) {
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(`{${pKey}}`, String(pVal)) as (typeof dict)[TranslationKey];
    }
  }

  return text;
}

export function useTranslation() {
  const [lang, setLangState] = useState<Language>(getLanguage);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const custom = e as CustomEvent<Language>;
      setLangState(custom.detail || getLanguage());
    };
    window.addEventListener('tvstream-lang-change', handler);
    return () => window.removeEventListener('tvstream-lang-change', handler);
  }, []);

  const changeLang = useCallback((newLang: Language) => {
    setLanguage(newLang);
    setLangState(newLang);
  }, []);

  const translate = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      return t(key, lang, params);
    },
    [lang],
  );

  return {
    lang,
    setLanguage: changeLang,
    t: translate,
  };
}
