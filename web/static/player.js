(function () {
  'use strict';
  var video = document.getElementById('video');
  var statusEl = document.getElementById('player-status');
  var retryBtn = document.getElementById('retry');
  var title = document.getElementById('player-title');
  var params = new URLSearchParams(location.search);
  var id = params.get('id') || params.get('channel') || '1';
  var manifestURL = '/channels/' + encodeURIComponent(id) + '/live.m3u8';
  var hls = null;
  title.textContent = 'Channel ' + id;
  video.muted = true; // autoplay policy: always start muted

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.className = isError ? 'error' : '';
  }

  function tryPlay() {
    var p = video.play();
    if (p && p.catch) p.catch(function () { setStatus('Press play to start (autoplay blocked).'); });
  }

  function destroy() {
    if (hls) { hls.destroy(); hls = null; }
  }

  function start() {
    destroy();
    retryBtn.hidden = true;
    setStatus('Loading...');
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ liveSyncDurationCount: 3, manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 4, fragLoadingMaxRetry: 4 });
      hls.loadSource(manifestURL);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function () { setStatus('Live'); tryPlay(); });
      hls.on(Hls.Events.ERROR, function (_e, data) {
        if (!data.fatal) {
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) setStatus('Buffering...');
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setStatus('Network error, reconnecting...', true);
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          setStatus('Media error, recovering...', true);
          hls.recoverMediaError();
        } else {
          setStatus('Playback failed: ' + data.details, true);
          destroy();
          retryBtn.hidden = false;
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifestURL; // native HLS (Safari / iOS)
      video.addEventListener('loadedmetadata', function () { setStatus('Live'); tryPlay(); }, { once: true });
      video.addEventListener('error', function () {
        setStatus('Playback error.', true);
        retryBtn.hidden = false;
      }, { once: true });
    } else {
      setStatus('HLS is not supported in this browser.', true);
    }
  }

  video.addEventListener('stalled', function () { setStatus('Stream stalled, waiting...'); });
  video.addEventListener('playing', function () { setStatus('Live'); });
  retryBtn.addEventListener('click', start);
  start();
})();
