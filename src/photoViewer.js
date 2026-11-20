import { getPhotoURL } from './store.js';
import { el } from './ui.js';

/** 全屏查看照片，左右滑动切换 */
export async function openPhotoViewer(photoIds, startIndex = 0) {
  if (!photoIds || !photoIds.length) return;

  const overlay = el(`
    <div class="viewer">
      <div class="viewer-bar">
        <span class="viewer-index"></span>
        <button class="viewer-close" type="button" aria-label="关闭">×</button>
      </div>
      <div class="viewer-track"></div>
    </div>
  `);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const track = overlay.querySelector('.viewer-track');
  const indexNode = overlay.querySelector('.viewer-index');

  const close = () => {
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };

  overlay.querySelector('.viewer-close').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  for (const id of photoIds) {
    const url = await getPhotoURL(id);
    track.appendChild(el(`
      <div class="viewer-slide">
        ${url ? `<img src="${url}" alt="">` : '<span class="viewer-missing">图片已丢失</span>'}
      </div>
    `));
  }

  const updateIndex = () => {
    if (!track.clientWidth) return;
    const current = Math.round(track.scrollLeft / track.clientWidth) + 1;
    indexNode.textContent = `${current} / ${photoIds.length}`;
  };

  let scrollTimer = null;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(updateIndex, 80);
  });

  requestAnimationFrame(() => {
    track.scrollLeft = Math.min(startIndex, photoIds.length - 1) * track.clientWidth;
    updateIndex();
  });
}
