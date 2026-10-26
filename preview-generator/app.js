const renderBtn = document.getElementById('renderBtn');
const bgInput = document.getElementById('bgInput');
const coverInput = document.getElementById('coverInput');
const audioInput = document.getElementById('audioInput');
const trackTitleInput = document.getElementById('trackTitle');
const aspectRatioSelect = document.getElementById('aspectRatioSelect');
const animationTypeSelect = document.getElementById('animationTypeSelect');
const durationSelect = document.getElementById('durationSelect');
const startRange = document.getElementById('startRange');
const timeRangeDisplay = document.getElementById('timeRangeDisplay');
const listenBtn = document.getElementById('listenBtn');
const statusDiv = document.getElementById('status');
const canvas = document.getElementById('renderCanvas');
const ctx = canvas.getContext('2d');

const waveCanvas = document.getElementById('waveCanvas');
const waveCtx = waveCanvas.getContext('2d');

const videoPreviewContainer = document.getElementById('videoPreviewContainer');
const previewVideoPlayer = document.getElementById('previewVideoPlayer');
const downloadBtn = document.getElementById('downloadBtn');

let loadedAudioBuffer = null;
let previewAudioSource = null;
let previewAudioCtx = null;
let currentVideoBlobUrl = null;

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function drawPlaceholderWave() {
  const w = waveCanvas.width;
  const h = waveCanvas.height;
  waveCtx.clearRect(0, 0, w, h);
  waveCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  for (let i = 0; i < w; i += 4) {
    const barHeight = Math.sin(i * 0.08) * 10 + 16;
    waveCtx.fillRect(i, (h - barHeight) / 2, 2, barHeight);
  }
}
drawPlaceholderWave();

function drawWaveformUI() {
  if (!loadedAudioBuffer) {
    drawPlaceholderWave();
    return;
  }
  const w = waveCanvas.width;
  const h = waveCanvas.height;
  const data = loadedAudioBuffer.getChannelData(0);
  const step = Math.ceil(data.length / w);
  const durSec = parseInt(durationSelect.value, 10) || 30;
  const startSec = parseFloat(startRange.value) || 0;
  const totalDur = loadedAudioBuffer.duration;

  waveCtx.clearRect(0, 0, w, h);

  waveCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  for (let i = 0; i < w; i++) {
    let min = 1.0;
    let max = -1.0;
    const startIndex = i * step;
    for (let j = 0; j < step; j += 8) {
      const datum = data[startIndex + j] || 0;
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    const barHeight = Math.max(2, (max - min) * (h / 2) * 0.85);
    waveCtx.fillRect(i, (h - barHeight) / 2, 1, barHeight);
  }

  const startX = (startSec / totalDur) * w;
  const sliceWidth = (durSec / totalDur) * w;

  waveCtx.fillStyle = 'rgba(255, 51, 102, 0.4)';
  waveCtx.fillRect(startX, 0, sliceWidth, h);

  waveCtx.strokeStyle = '#ff3366';
  waveCtx.lineWidth = 2;
  waveCtx.strokeRect(startX, 0, sliceWidth, h);
}

function updateRangeLabels() {
  const startSec = parseFloat(startRange.value) || 0;
  const durSec = parseInt(durationSelect.value, 10) || 30;
  const endSec = startSec + durSec;
  timeRangeDisplay.textContent = `${formatTime(startSec)} – ${formatTime(endSec)}`;
  drawWaveformUI();
}

waveCanvas.onclick = (e) => {
  if (!loadedAudioBuffer) return;
  const rect = waveCanvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
  const durSec = parseInt(durationSelect.value, 10) || 30;
  const maxStart = Math.max(0, loadedAudioBuffer.duration - durSec);

  const targetStart = Math.min(maxStart, clickRatio * loadedAudioBuffer.duration);
  startRange.value = targetStart;
  updateRangeLabels();

  if (previewAudioSource) {
    stopAudioPreview();
    startAudioPreview();
  }
};

audioInput.onchange = async () => {
  const file = audioInput.files[0];
  if (!file) return;

  const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').toUpperCase();
  if (!trackTitleInput.value || trackTitleInput.value === 'ARTIST - TRACK NAME') {
    trackTitleInput.value = cleanName;
  }

  statusDiv.textContent = 'Анализ аудиофайла...';
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    loadedAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const durSec = parseInt(durationSelect.value, 10) || 30;
    const maxStart = Math.max(0, loadedAudioBuffer.duration - durSec);

    startRange.max = maxStart;
    startRange.value = 0;
    updateRangeLabels();
    statusDiv.textContent = `Трек загружен (${formatTime(loadedAudioBuffer.duration)}). Кликните по волне для выбора фрагмента.`;
  } catch (err) {
    console.error(err);
    statusDiv.textContent = 'Ошибка загрузки аудиофайла';
  }
};

durationSelect.onchange = () => {
  if (loadedAudioBuffer) {
    const durSec = parseInt(durationSelect.value, 10) || 30;
    const maxStart = Math.max(0, loadedAudioBuffer.duration - durSec);
    startRange.max = maxStart;
    if (parseFloat(startRange.value) > maxStart) {
      startRange.value = maxStart;
    }
  }
  updateRangeLabels();
};

startRange.oninput = updateRangeLabels;

function stopAudioPreview() {
  if (previewAudioSource) {
    try { previewAudioSource.stop(); } catch (e) {}
    previewAudioSource.disconnect();
    previewAudioSource = null;
    listenBtn.textContent = '▶ Послушать выбранный отрезок';
  }
}

function startAudioPreview() {
  if (!loadedAudioBuffer) return;
  if (!previewAudioCtx) {
    previewAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  const startSec = parseFloat(startRange.value) || 0;
  const durSec = parseInt(durationSelect.value, 10) || 30;

  previewAudioSource = previewAudioCtx.createBufferSource();
  previewAudioSource.buffer = loadedAudioBuffer;
  previewAudioSource.connect(previewAudioCtx.destination);
  previewAudioSource.start(0, startSec, durSec);
  listenBtn.textContent = '⏹ Остановить прослушивание';

  previewAudioSource.onended = () => {
    previewAudioSource = null;
    listenBtn.textContent = '▶ Послушать выбранный отрезок';
  };
}

listenBtn.onclick = () => {
  if (previewAudioSource) {
    stopAudioPreview();
  } else {
    startAudioPreview();
  }
};

renderBtn.onclick = async () => {
  const bgFile = bgInput.files[0];
  const coverFile = coverInput.files[0];

  if (!coverFile) {
    alert('Пожалуйста, выберите обложку трека!');
    return;
  }

  stopAudioPreview();
  renderBtn.disabled = true;
  videoPreviewContainer.style.display = 'none';

  try {
    statusDiv.textContent = 'Обработка изображений и звука...';

    // 1. Декодируем изображения
    const coverBitmap = await createImageBitmap(coverFile);
    let bgBitmap = null;
    if (bgFile) {
      bgBitmap = await createImageBitmap(bgFile);
    }

    // 2. Параметры аудио
    const durationSec = parseInt(durationSelect.value, 10) || 30;
    const startOffsetSec = parseFloat(startRange.value) || 0;
    const title = trackTitleInput.value || 'TRACK PREVIEW';
    const animType = animationTypeSelect.value || 'sleeve_vinyl';
    const formatRatio = aspectRatioSelect.value || '4:5';

    let pcmData = null;
    let sampleRate = 44100;
    let numberOfChannels = 1;

    if (loadedAudioBuffer) {
      pcmData = loadedAudioBuffer.getChannelData(0);
      sampleRate = loadedAudioBuffer.sampleRate;
      numberOfChannels = loadedAudioBuffer.numberOfChannels;
    }

    // 3. Разрешение под выбранный формат
    let width = 1080;
    let height = 1350; // 4:5 по умолчанию
    if (formatRatio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (formatRatio === '1:1') {
      width = 1080;
      height = 1080;
    }

    canvas.width = width;
    canvas.height = height;

    // Подстраиваем CSS-пропорции плеера предпросмотра
    if (formatRatio === '9:16') {
      previewVideoPlayer.style.aspectRatio = '9 / 16';
    } else if (formatRatio === '1:1') {
      previewVideoPlayer.style.aspectRatio = '1 / 1';
    } else {
      previewVideoPlayer.style.aspectRatio = '4 / 5';
    }

    const fps = 30;
    const totalFrames = fps * durationSec;

    // 4. Настройка Muxer
    const muxerOptions = {
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height
      },
      fastStart: 'in-memory'
    };

    if (loadedAudioBuffer) {
      muxerOptions.audio = {
        codec: 'aac',
        sampleRate: sampleRate,
        numberOfChannels: numberOfChannels
      };
    }

    const muxer = new Mp4Muxer.Muxer(muxerOptions);

    // 5. Настройка VideoEncoder (AVC Level 4.2 для полной поддержки 1080x1920)
    let videoError = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        console.error('Ошибка видеокодека:', e);
        videoError = e;
      }
    });

    videoEncoder.configure({
      codec: 'avc1.42002a', // Level 4.2 поддерживает и Full HD, и вертикальные 1920
      width,
      height,
      bitrate: formatRatio === '9:16' ? 7_500_000 : 6_000_000,
      framerate: fps
    });

    // 6. Кодирование AAC аудио
    let audioEncoder = null;
    if (loadedAudioBuffer && 'AudioEncoder' in window) {
      statusDiv.textContent = 'Кодирование звуковой дорожки...';

      let audioError = null;
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => {
          console.error('Ошибка аудиокодека:', e);
          audioError = e;
        }
      });

      audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: sampleRate,
        numberOfChannels: numberOfChannels,
        bitrate: 192_000
      });

      const startSampleOffset = Math.floor(startOffsetSec * sampleRate);
      const totalSamplesToEncode = Math.floor(durationSec * sampleRate);
      const chunkSize = 1024;

      for (let offset = 0; offset < totalSamplesToEncode; offset += chunkSize) {
        if (audioError) throw audioError;

        while (audioEncoder.encodeQueueSize > 10) {
          await new Promise((r) => setTimeout(r, 10));
        }

        const remaining = totalSamplesToEncode - offset;
        const frameCount = Math.min(chunkSize, remaining);

        const combined = new Float32Array(chunkSize * numberOfChannels);
        for (let ch = 0; ch < numberOfChannels; ch++) {
          const chData = loadedAudioBuffer.getChannelData(ch);
          const actualSourceIndex = startSampleOffset + offset;
          const slice = chData.subarray(actualSourceIndex, actualSourceIndex + frameCount);
          combined.set(slice, ch * chunkSize);
        }

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: sampleRate,
          numberOfFrames: chunkSize,
          numberOfChannels: numberOfChannels,
          timestamp: Math.round((offset / sampleRate) * 1_000_000),
          data: combined
        });

        audioEncoder.encode(audioData);
        audioData.close();
      }

      await audioEncoder.flush();
    }

    // --- Размеры и геометрия (адаптируются под 4:5, 9:16 и 1:1) ---
    let vinylRadius = 360;
    let boxSize = 740;
    let centerY = height / 2 - 80;
    let eqBaseY = height - 160;
    let textY = height - 78;

    if (formatRatio === '9:16') {
      vinylRadius = 380;
      boxSize = 780;
      centerY = height / 2 - 120;
      eqBaseY = height - 280;
      textY = height - 190;
    } else if (formatRatio === '1:1') {
      vinylRadius = 300;
      boxSize = 620;
      centerY = height / 2 - 50;
      eqBaseY = height - 120;
      textY = height - 52;
    }

    const finalVinylX = width / 2;
    const boxStartX = (width - boxSize) / 2;
    const boxFinalX = -boxSize - 180;
    const boxY = centerY - boxSize / 2;
    const initialVinylX = boxStartX + boxSize / 2;

    const pauseDuration = 0.5;
    const slideDuration = 4.0;
    const moveEndTime = pauseDuration + slideDuration;
    const targetOmega = (Math.PI * 2) / 14;

    const numBars = 80;
    const smoothedBars = new Float32Array(numBars).fill(0.05);

    function drawVinyl(posX, posY, angle) {
      const r = vinylRadius;
      ctx.save();
      ctx.translate(posX, posY);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 20;

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0d';
      ctx.fill();
      ctx.shadowColor = 'transparent';

      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(coverBitmap, -r, -r, r * 2, r * 2);
      ctx.restore();

      ctx.strokeStyle = 'rgba(15, 15, 20, 0.96)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      for (let cr = r * 0.28; cr < r * 0.94; cr += 10) {
        ctx.beginPath();
        ctx.arc(0, 0, cr, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#111116';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const sheenGrad = ctx.createLinearGradient(-r, -r, r, r);
      sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
      sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
      ctx.fillStyle = sheenGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 7. Покадровый рендеринг видео
    for (let i = 0; i < totalFrames; i++) {
      if (videoError) throw videoError;

      while (videoEncoder.encodeQueueSize > 5) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const progress = i / totalFrames;
      const currentTimeSec = i / fps;
      const timestampMicroseconds = currentTimeSec * 1_000_000;

      // Анализ спектра
      if (pcmData) {
        const sampleIndex = Math.floor((startOffsetSec + currentTimeSec) * sampleRate);
        for (let b = 0; b < numBars; b++) {
          const rawVal = Math.abs(pcmData[sampleIndex + b * 20] || 0);
          smoothedBars[b] = smoothedBars[b] * 0.72 + rawVal * 0.28;
        }
      } else {
        for (let b = 0; b < numBars; b++) {
          smoothedBars[b] = 0.06 + Math.sin(progress * 6 + b * 0.3) * 0.04;
        }
      }

      // --- ОТРИСОВКА ХОЛСТА ---

      // 1. Размытый фон
      const bgImg = bgBitmap || coverBitmap;
      ctx.save();
      ctx.filter = 'blur(36px) brightness(0.38)';
      const bgScale = 1.15;
      const bgW = width * bgScale;
      const bgH = height * bgScale;
      ctx.drawImage(bgImg, (width - bgW) / 2, (height - bgH) / 2, bgW, bgH);
      ctx.restore();

      // Виньетка
      const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.38, width / 2, height / 2, width * 0.82);
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.78)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // ==========================================
      // ВАРИАНТЫ АНИМАЦИИ
      // ==========================================
      if (animType === 'sleeve_vinyl') {
        let animProgress = 0;
        if (currentTimeSec > pauseDuration) {
          const moveTime = currentTimeSec - pauseDuration;
          animProgress = Math.min(1.0, easeInOutCubic(moveTime / slideDuration));
        }

        const currentBoxX = boxStartX + (boxFinalX - boxStartX) * animProgress;
        const currentVinylX = initialVinylX + (finalVinylX - initialVinylX) * animProgress;

        if (currentBoxX + boxSize > -50) {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 45;
          ctx.shadowOffsetX = 10;
          ctx.shadowOffsetY = 22;

          ctx.beginPath();
          ctx.roundRect(currentBoxX, boxY, boxSize, boxSize, 10);
          ctx.fillStyle = '#08080c';
          ctx.fill();
          ctx.shadowColor = 'transparent';

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(currentBoxX, boxY, boxSize, boxSize, 10);
          ctx.clip();
          ctx.drawImage(coverBitmap, currentBoxX, boxY, boxSize, boxSize);

          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.fillRect(currentBoxX, boxY, boxSize, boxSize);
          ctx.restore();

          ctx.restore();
        }

        let rotationAngle = 0;
        if (currentTimeSec > pauseDuration && currentTimeSec <= moveEndTime) {
          const t = (currentTimeSec - pauseDuration) / slideDuration;
          rotationAngle = 0.5 * targetOmega * slideDuration * (t * t);
        } else if (currentTimeSec > moveEndTime) {
          const angleAtFullSpeed = 0.5 * targetOmega * slideDuration;
          const steadyTime = currentTimeSec - moveEndTime;
          rotationAngle = angleAtFullSpeed + steadyTime * targetOmega;
        }

        drawVinyl(currentVinylX, centerY, rotationAngle);

        if (currentBoxX + boxSize > -50) {
          ctx.save();

          const cutoutRadius = Math.round(boxSize * 0.088);
          const cutoutCenterY = boxY + boxSize / 2;

          ctx.beginPath();
          ctx.moveTo(currentBoxX, boxY);
          ctx.lineTo(currentBoxX + boxSize, boxY);
          ctx.lineTo(currentBoxX + boxSize, cutoutCenterY - cutoutRadius);
          ctx.arc(currentBoxX + boxSize, cutoutCenterY, cutoutRadius, -Math.PI * 0.5, Math.PI * 0.5, true);
          ctx.lineTo(currentBoxX + boxSize, boxY + boxSize);
          ctx.lineTo(currentBoxX, boxY + boxSize);
          ctx.closePath();

          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 35;
          ctx.shadowOffsetX = 8;
          ctx.shadowOffsetY = 16;
          ctx.fillStyle = '#101015';
          ctx.fill();
          ctx.shadowColor = 'transparent';

          ctx.save();
          ctx.clip();
          ctx.drawImage(coverBitmap, currentBoxX, boxY, boxSize, boxSize);

          const coverGloss = ctx.createLinearGradient(currentBoxX, boxY, currentBoxX + boxSize, boxY + boxSize);
          coverGloss.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
          coverGloss.addColorStop(0.2, 'rgba(255, 255, 255, 0.04)');
          coverGloss.addColorStop(0.5, 'rgba(0, 0, 0, 0.0)');
          coverGloss.addColorStop(0.8, 'rgba(0, 0, 0, 0.25)');
          coverGloss.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
          ctx.fillStyle = coverGloss;
          ctx.fillRect(currentBoxX, boxY, boxSize, boxSize);

          const spineGrad = ctx.createLinearGradient(currentBoxX, boxY, currentBoxX + 24, boxY);
          spineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
          spineGrad.addColorStop(0.25, 'rgba(0, 0, 0, 0.1)');
          spineGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.45)');
          spineGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
          ctx.fillStyle = spineGrad;
          ctx.fillRect(currentBoxX, boxY, 24, boxSize);

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(currentBoxX + 24, boxY);
          ctx.lineTo(currentBoxX + 24, boxY + boxSize);
          ctx.stroke();

          ctx.restore();

          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(currentBoxX, boxY + 1);
          ctx.lineTo(currentBoxX + boxSize, boxY + 1);
          ctx.moveTo(currentBoxX, boxY + boxSize - 1);
          ctx.lineTo(currentBoxX + boxSize, boxY + boxSize - 1);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(currentBoxX + boxSize, cutoutCenterY, cutoutRadius, -Math.PI * 0.5, Math.PI * 0.5, true);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(currentBoxX + boxSize, boxY);
          ctx.lineTo(currentBoxX + boxSize, cutoutCenterY - cutoutRadius);
          ctx.moveTo(currentBoxX + boxSize, cutoutCenterY + cutoutRadius);
          ctx.lineTo(currentBoxX + boxSize, boxY + boxSize);
          ctx.stroke();
          ctx.restore();

          ctx.restore();
        }
      } else if (animType === 'only_vinyl') {
        const rotationAngle = currentTimeSec * targetOmega;
        drawVinyl(finalVinylX, centerY, rotationAngle);
      } else if (animType === 'square_cover') {
        const sqBaseSize = Math.round(boxSize * 0.96);
        const zoomScale = 1.0 + progress * 0.035;
        const curSqSize = sqBaseSize * zoomScale;
        
        const driftX = Math.sin(currentTimeSec * 0.7) * 4;
        const driftY = Math.cos(currentTimeSec * 0.5) * 5;

        const sqX = (width - curSqSize) / 2 + driftX;
        const sqY = centerY - curSqSize / 2 + driftY;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 55;
        ctx.shadowOffsetX = 6;
        ctx.shadowOffsetY = 24;

        ctx.beginPath();
        ctx.roundRect(sqX, sqY, curSqSize, curSqSize, 14);
        ctx.fillStyle = '#101016';
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(sqX, sqY, curSqSize, curSqSize, 14);
        ctx.clip();
        ctx.drawImage(coverBitmap, sqX, sqY, curSqSize, curSqSize);

        const glossGrad = ctx.createLinearGradient(sqX, sqY, sqX + curSqSize, sqY + curSqSize);
        glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
        glossGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.0)');
        glossGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.0)');
        glossGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
        ctx.fillStyle = glossGrad;
        ctx.fillRect(sqX, sqY, curSqSize, curSqSize);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(sqX + 1, sqY + 1, curSqSize - 2, curSqSize - 2, 13);
        ctx.stroke();

        ctx.restore();
        ctx.restore();
      }

      // ==========================================
      // ЭКВАЛАЙЗЕР И ТЕКСТ ВНИЗУ
      // ==========================================
      const barTotalWidth = formatRatio === '1:1' ? 680 : 740;
      const startX = (width - barTotalWidth) / 2;
      const gap = 3;
      const barWidth = (barTotalWidth - (numBars - 1) * gap) / numBars;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      for (let b = 0; b < numBars; b++) {
        const barHeight = Math.max(4, Math.min(50, smoothedBars[b] * 60));
        const bx = startX + b * (barWidth + gap);
        const by = eqBaseY - barHeight;

        ctx.beginPath();
        ctx.roundRect(bx, by, barWidth, barHeight, 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(startX, eqBaseY + 12, barTotalWidth, 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(startX, eqBaseY + 12, barTotalWidth * progress, 2);

      ctx.save();
      ctx.fillStyle = '#ffffff';
      const fontSize = formatRatio === '1:1' ? 28 : 32;
      ctx.font = `700 ${fontSize}px "TrackCustomFont", "Arial Narrow", "Arial-Narrow", sans-serif-condensed, sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
      ctx.letterSpacing = '3px';
      ctx.fillText(title, width / 2, textY, 860);
      ctx.restore();

      const frame = new VideoFrame(canvas, {
        timestamp: timestampMicroseconds,
        duration: (1 / fps) * 1_000_000
      });

      const keyFrame = i % (fps * 2) === 0;
      videoEncoder.encode(frame, { keyFrame });
      frame.close();

      if (i % 6 === 0) {
        statusDiv.textContent = `Рендеринг (${formatRatio}): ${Math.round(progress * 100)}%`;
      }
    }

    // 8. Финализация MP4 и вывод в предпросмотр
    statusDiv.textContent = 'Упаковка MP4...';
    await videoEncoder.flush();
    muxer.finalize();

    if (currentVideoBlobUrl) {
      URL.revokeObjectURL(currentVideoBlobUrl);
    }

    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    currentVideoBlobUrl = URL.createObjectURL(blob);

    previewVideoPlayer.src = currentVideoBlobUrl;
    downloadBtn.href = currentVideoBlobUrl;
    downloadBtn.download = `${title.replace(/[^a-z0-9а-яё]/gi, '_')}_${formatRatio.replace(':', 'x')}.mp4`;

    videoPreviewContainer.style.display = 'flex';
    statusDiv.textContent = 'Готово! Посмотрите результат ниже перед скачиванием.';
  } catch (err) {
    console.error(err);
    statusDiv.textContent = `Ошибка: ${err.message || err}`;
  } finally {
    renderBtn.disabled = false;
  }
};