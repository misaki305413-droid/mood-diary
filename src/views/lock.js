import { createVault, emit, hasVault, unlockWithPin, unlockWithRecovery } from '../store.js';
import { el, escapeHtml, toast } from '../ui.js';

const FAIL_KEY = 'mood-diary-pin-fails';
const UNTIL_KEY = 'mood-diary-pin-locked-until';
const MAX_ATTEMPTS = 5;

let activeKeyHandler = null;
let countdownTimer = null;

function readFailures() {
  return Number(localStorage.getItem(FAIL_KEY) || 0);
}

function readLockedUntil() {
  return Number(localStorage.getItem(UNTIL_KEY) || 0);
}

/** 连续错误 5 次后锁定 30 秒，之后每次翻倍，上限 30 分钟 */
function registerFailure() {
  const fails = readFailures() + 1;
  localStorage.setItem(FAIL_KEY, String(fails));
  if (fails >= MAX_ATTEMPTS) {
    const round = Math.floor(fails / MAX_ATTEMPTS);
    const seconds = Math.min(30 * 2 ** (round - 1), 1800);
    localStorage.setItem(UNTIL_KEY, String(Date.now() + seconds * 1000));
    return seconds;
  }
  return 0;
}

function clearFailures() {
  localStorage.removeItem(FAIL_KEY);
  localStorage.removeItem(UNTIL_KEY);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function attachKeyHandler(handler) {
  if (activeKeyHandler) document.removeEventListener('keydown', activeKeyHandler);
  activeKeyHandler = handler;
  document.addEventListener('keydown', handler);
}

/** 解锁后必须移除键盘监听，否则在输入框里打字会被当成 PIN */
export function detachLock() {
  if (activeKeyHandler) {
    document.removeEventListener('keydown', activeKeyHandler);
    activeKeyHandler = null;
  }
  stopCountdown();
}

export async function renderLock(container) {
  const exists = await hasVault();
  container.innerHTML = '';
  container.appendChild(exists ? unlockScreen() : setupScreen());
}

function screenShell(inner) {
  return el(`
    <div class="lock-screen">
      <div class="lock-inner">${inner}</div>
    </div>
  `);
}

function pinPad() {
  return el(`
    <div class="pin-pad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="pin-key" data-key="${n}">${n}</button>`).join('')}
      <button class="pin-key pin-key-ghost" data-key="blank" disabled></button>
      <button class="pin-key" data-key="0">0</button>
      <button class="pin-key pin-key-ghost" data-key="delete" aria-label="删除">⌫</button>
    </div>
  `);
}

function dotsRow() {
  return el('<div class="pin-dots">' + '<span></span>'.repeat(6) + '</div>');
}

function updateDots(dotsNode, length) {
  [...dotsNode.children].forEach((dot, index) => {
    dot.classList.toggle('is-filled', index < length);
  });
}

function unlockScreen() {
  const wrapper = screenShell(`
    <div class="lock-logo">🌤</div>
    <h1 class="lock-title">心情日记</h1>
    <p class="lock-subtitle">输入 6 位密码解锁</p>
    <div class="pin-dots-slot"></div>
    <p class="pin-message" hidden></p>
    <div class="pin-pad-slot"></div>
    <button class="link-btn" data-role="recovery">使用恢复码</button>
  `);

  const dotsSlot = wrapper.querySelector('.pin-dots-slot');
  const padSlot = wrapper.querySelector('.pin-pad-slot');
  const message = wrapper.querySelector('.pin-message');

  const dots = dotsRow();
  dotsSlot.replaceWith(dots);

  let value = '';
  let busy = false;

  const showError = (text) => {
    message.textContent = text;
    message.hidden = false;
    dots.classList.add('is-shaking');
    setTimeout(() => dots.classList.remove('is-shaking'), 420);
  };

  const pad = pinPad();
  padSlot.replaceWith(pad);

  const startCountdown = () => {
    stopCountdown();
    const tick = () => {
      const remaining = Math.ceil((readLockedUntil() - Date.now()) / 1000);
      if (remaining <= 0) {
        stopCountdown();
        message.hidden = true;
        pad.classList.remove('is-disabled');
        return;
      }
      message.textContent = `密码错误次数过多，请等待 ${remaining} 秒`;
      message.hidden = false;
      pad.classList.add('is-disabled');
    };
    tick();
    if (!countdownTimer) countdownTimer = setInterval(tick, 1000);
  };

  if (readLockedUntil() > Date.now()) startCountdown();

  const press = (key) => {
    if (busy || readLockedUntil() > Date.now()) return;
    message.hidden = true;
    if (key === 'delete') {
      value = value.slice(0, -1);
      updateDots(dots, value.length);
      return;
    }
    if (key === 'blank') return;
    if (value.length >= 6) return;
    value += key;
    updateDots(dots, value.length);
    if (value.length === 6) {
      const submitted = value;
      value = '';
      setTimeout(() => {
        if (!busy) {
          busy = true;
          unlockWithPin(submitted)
            .then(() => {
              clearFailures();
              message.hidden = true;
            })
            .catch((error) => {
              updateDots(dots, 0);
              const seconds = registerFailure();
              if (seconds > 0) {
                startCountdown();
              } else {
                showError(error.message || '密码不正确');
              }
            })
            .finally(() => {
              busy = false;
            });
        }
      }, 90);
    }
  };

  pad.addEventListener('click', (event) => {
    const button = event.target.closest('.pin-key');
    if (!button || button.disabled) return;
    press(button.dataset.key);
  });

  const onKeyDown = (event) => {
    if (/^[0-9]$/.test(event.key)) press(event.key);
    else if (event.key === 'Backspace') press('delete');
  };
  attachKeyHandler(onKeyDown);

  wrapper.querySelector('[data-role="recovery"]').addEventListener('click', () => {
    openRecoveryEntry(wrapper);
  });

  return wrapper;
}

function openRecoveryEntry(wrapper) {
  const existing = wrapper.querySelector('.recovery-panel');
  if (existing) existing.remove();

  const panel = el(`
    <div class="recovery-panel">
      <p class="recovery-hint">输入创建时保存的恢复码（32 位字母数字）</p>
      <textarea class="recovery-input" rows="2" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"></textarea>
      <div class="modal-actions">
        <button class="btn" data-role="cancel">取消</button>
        <button class="btn btn-primary" data-role="submit">解锁</button>
      </div>
    </div>
  `);

  wrapper.querySelector('.lock-inner').appendChild(panel);
  const input = panel.querySelector('.recovery-input');
  setTimeout(() => input.focus(), 100);

  panel.querySelector('[data-role="cancel"]').addEventListener('click', () => panel.remove());
  panel.querySelector('[data-role="submit"]').addEventListener('click', async () => {
    const code = input.value.trim();
    if (!code) return;
    try {
      await unlockWithRecovery(code);
    } catch (error) {
      toast(error.message || '恢复码不正确');
      input.value = '';
      input.focus();
    }
  });
}

function setupScreen() {
  const wrapper = screenShell(`
    <div class="lock-logo">🌤</div>
    <h1 class="lock-title">创建密码</h1>
    <p class="lock-subtitle">设置 6 位密码，保护你的日记</p>
    <div class="pin-dots-slot"></div>
    <p class="pin-message" hidden></p>
    <div class="pin-pad-slot"></div>
  `);

  const dots = dotsRow();
  wrapper.querySelector('.pin-dots-slot').replaceWith(dots);
  const pad = pinPad();
  wrapper.querySelector('.pin-pad-slot').replaceWith(pad);
  const message = wrapper.querySelector('.pin-message');

  let stage = 'first';
  let firstPin = '';
  let value = '';
  let busy = false;

  const showError = (text) => {
    message.textContent = text;
    message.hidden = false;
    dots.classList.add('is-shaking');
    setTimeout(() => dots.classList.remove('is-shaking'), 420);
  };

  const submit = async (pin) => {
    busy = true;
    try {
      const recoveryCode = await createVault(pin);
      showRecoveryScreen(wrapper, recoveryCode);
    } catch (error) {
      showError(error.message || '创建失败');
      value = '';
      updateDots(dots, 0);
    } finally {
      busy = false;
    }
  };

  const press = (key) => {
    if (busy) return;
    message.hidden = true;
    if (key === 'delete') {
      value = value.slice(0, -1);
      updateDots(dots, value.length);
      return;
    }
    if (key === 'blank') return;
    if (value.length >= 6) return;
    value += key;
    updateDots(dots, value.length);
    if (value.length === 6) {
      const submitted = value;
      value = '';
      setTimeout(() => {
        if (busy) return;
        if (stage === 'first') {
          firstPin = submitted;
          stage = 'second';
          wrapper.querySelector('.lock-subtitle').textContent = '再输入一次确认';
          updateDots(dots, 0);
        } else if (submitted === firstPin) {
          submit(submitted);
        } else {
          stage = 'first';
          firstPin = '';
          wrapper.querySelector('.lock-subtitle').textContent = '设置 6 位密码，保护你的日记';
          showError('两次输入不一致，请重新设置');
          updateDots(dots, 0);
        }
      }, 90);
    }
  };

  pad.addEventListener('click', (event) => {
    const button = event.target.closest('.pin-key');
    if (!button || button.disabled) return;
    press(button.dataset.key);
  });

  const onKeyDown = (event) => {
    if (/^[0-9]$/.test(event.key)) press(event.key);
    else if (event.key === 'Backspace') press('delete');
  };
  attachKeyHandler(onKeyDown);

  return wrapper;
}

function showRecoveryScreen(wrapper, code) {
  const inner = wrapper.querySelector('.lock-inner');
  inner.innerHTML = `
    <div class="lock-logo">🔑</div>
    <h1 class="lock-title">保存恢复码</h1>
    <p class="lock-subtitle">忘记密码时，它是唯一能找回数据的方式</p>
    <div class="recovery-code">${escapeHtml(code)}</div>
    <p class="recovery-warning">请抄写或拍照保存到别处。恢复码只显示这一次，App 不会保存它。</p>
    <div class="modal-actions">
      <button class="btn" data-role="copy">复制</button>
      <button class="btn btn-primary" data-role="done">我已保存</button>
    </div>
  `;

  inner.querySelector('[data-role="copy"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('已复制到剪贴板');
    } catch {
      toast('复制失败，请手动抄写');
    }
  });

  inner.querySelector('[data-role="done"]').addEventListener('click', () => {
    emit();
  });
}
