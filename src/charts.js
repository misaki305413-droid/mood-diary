function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function setupCanvas(canvas) {
  const retina = Math.min(window.devicePixelRatio || 1, 3);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = Math.round(width * retina);
  canvas.height = Math.round(height * retina);
  const context = canvas.getContext('2d');
  context.setTransform(retina, 0, 0, retina, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

/**
 * 图表在元素进入布局前尺寸为 0，此时绘制会得到非法半径。
 * 这里等到有实际尺寸后再画，并且不让单个图表异常拖垮整页。
 */
function whenSized(canvas, paint) {
  let attempts = 0;
  const attempt = () => {
    if (!canvas.isConnected) return;
    const rect = canvas.getBoundingClientRect();
    if ((rect.width < 24 || rect.height < 24) && attempts < 90) {
      attempts += 1;
      requestAnimationFrame(attempt);
      return;
    }
    if (rect.width < 24 || rect.height < 24) return;
    try {
      paint();
    } catch (error) {
      console.error('图表绘制失败', error);
    }
  };
  requestAnimationFrame(attempt);
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

/**
 * 心情趋势折线图。
 * points: [{ label, value: number|null }]，value 取值范围 1~5。
 */
export function drawTrend(canvas, points) {
  whenSized(canvas, () => paintTrend(canvas, points));
}

function paintTrend(canvas, points) {
  const { context, width, height } = setupCanvas(canvas);
  const padding = { top: 16, right: 12, bottom: 22, left: 12 };
  const innerWidth = Math.max(1, width - padding.left - padding.right);
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);

  const line = cssVar('--text-tertiary', '#8a8a90');
  const grid = cssVar('--border', '#e6e6ea');
  const accent = cssVar('--accent', '#5b7cfa');

  context.strokeStyle = grid;
  context.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (innerHeight / 4) * i;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
  }

  const usable = points.map((point, index) => ({
    ...point,
    x: points.length <= 1
      ? padding.left + innerWidth / 2
      : padding.left + (innerWidth / (points.length - 1)) * index,
    y: point.value == null
      ? null
      : padding.top + innerHeight - ((point.value - 1) / 4) * innerHeight,
  }));

  const segments = [];
  let current = [];
  for (const point of usable) {
    if (point.y == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length) segments.push(current);

  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = accent;

  for (const segment of segments) {
    if (segment.length === 1) continue;
    context.beginPath();
    segment.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
  }

  const gradient = context.createLinearGradient(0, padding.top, 0, padding.top + innerHeight);
  gradient.addColorStop(0, cssVar('--accent-soft', 'rgba(91,124,250,0.22)'));
  gradient.addColorStop(1, 'rgba(91,124,250,0)');
  for (const segment of segments) {
    if (segment.length < 2) continue;
    context.beginPath();
    context.moveTo(segment[0].x, padding.top + innerHeight);
    segment.forEach((point) => context.lineTo(point.x, point.y));
    context.lineTo(segment[segment.length - 1].x, padding.top + innerHeight);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
  }

  context.fillStyle = accent;
  for (const point of usable) {
    if (point.y == null) continue;
    context.beginPath();
    context.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = line;
  context.font = '11px -apple-system, system-ui, sans-serif';
  context.textBaseline = 'top';
  const step = Math.max(1, Math.ceil(points.length / 6));
  points.forEach((point, index) => {
    if (index % step !== 0 && index !== points.length - 1) return;
    const x = usable[index].x;
    context.textAlign = index === 0 ? 'left' : index === points.length - 1 ? 'right' : 'center';
    context.fillText(point.label, x, height - padding.bottom + 6);
  });
}

/** 环形分布图。segments: [{ value, color, label }] */
export function drawRing(canvas, segments) {
  whenSized(canvas, () => paintRing(canvas, segments));
}

function paintRing(canvas, segments) {
  const { context, width, height } = setupCanvas(canvas);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(10, Math.min(width, height) / 2 - 14);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  context.lineWidth = Math.min(22, radius * 0.7);
  context.lineCap = 'butt';

  if (total === 0) {
    context.strokeStyle = cssVar('--border', '#e6e6ea');
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    return;
  }

  let start = -Math.PI / 2;
  for (const segment of segments) {
    if (segment.value <= 0) continue;
    const angle = (segment.value / total) * Math.PI * 2;
    context.strokeStyle = segment.color;
    context.beginPath();
    context.arc(centerX, centerY, radius, start + 0.012, start + angle - 0.012);
    context.stroke();
    start += angle;
  }
}

/** 横向条形图。items: [{ label, value, suffix }] */
export function drawBars(canvas, items, { maxValue = 1 } = {}) {
  whenSized(canvas, () => paintBars(canvas, items, maxValue));
}

function paintBars(canvas, items, maxValue) {
  const { context, width, height } = setupCanvas(canvas);
  const rowHeight = Math.min(46, height / Math.max(items.length, 1));
  const labelWidth = Math.min(96, width * 0.34);
  const barHeight = 10;
  const textColor = cssVar('--text-secondary', '#6b6b73');
  const trackColor = cssVar('--surface-sunken', 'rgba(0,0,0,0.06)');
  const accent = cssVar('--accent', '#5b7cfa');

  context.font = '12px -apple-system, system-ui, sans-serif';
  context.textBaseline = 'middle';

  items.forEach((item, index) => {
    const centerY = rowHeight * index + rowHeight / 2;
    context.fillStyle = textColor;
    context.textAlign = 'left';
    const label = item.label.length > 7 ? `${item.label.slice(0, 7)}…` : item.label;
    context.fillText(label, 8, centerY);

    const barX = labelWidth + 12;
    const barWidth = Math.max(20, width - barX - 46);
    roundRect(context, barX, centerY - barHeight / 2, barWidth, barHeight, barHeight / 2);
    context.fillStyle = trackColor;
    context.fill();

    const ratio = Math.max(0, Math.min(1, item.value / (maxValue || 1)));
    if (ratio > 0) {
      roundRect(context, barX, centerY - barHeight / 2, Math.max(barHeight, barWidth * ratio), barHeight, barHeight / 2);
      context.fillStyle = accent;
      context.fill();
    }

    context.fillStyle = textColor;
    context.textAlign = 'right';
    context.fillText(item.suffix || '', width - 6, centerY);
  });
}
