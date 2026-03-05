/**
 * CustomDialog - ブラウザ標準のalert/confirmを置き換えるカスタムダイアログUI
 * 白地でシンプルなデザインを提供し、Promiseベースで非同期に処理を待機します。
 */

class CustomDialogManager {
  constructor() {
    this.injectStyles();
  }

  injectStyles() {
    if (document.getElementById('custom-dialog-styles')) return;

    const style = document.createElement('style');
    style.id = 'custom-dialog-styles';
    style.textContent = `
      .custom-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999999;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease, visibility 0.2s ease;
      }
      .custom-dialog-overlay.show {
        opacity: 1;
        visibility: visible;
      }
      .custom-dialog-box {
        background-color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        width: 90%;
        max-width: 400px;
        padding: 24px;
        text-align: center;
        transform: scale(0.95);
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .custom-dialog-overlay.show .custom-dialog-box {
        transform: scale(1);
      }
      .custom-dialog-message {
        color: #333333;
        font-size: 16px;
        line-height: 1.5;
        margin-bottom: 24px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .custom-dialog-buttons {
        display: flex;
        justify-content: center;
        gap: 12px;
      }
      .custom-dialog-btn {
        padding: 10px 24px;
        border: none;
        border-radius: 6px;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s, transform 0.1s;
        outline: none;
        min-width: 100px;
      }
      .custom-dialog-btn:active {
        transform: scale(0.97);
      }
      .custom-dialog-btn-primary {
        background-color: #007bff;
        color: #ffffff;
      }
      .custom-dialog-btn-primary:hover {
        background-color: #0069d9;
      }
      .custom-dialog-btn-secondary {
        background-color: #f1f3f5;
        color: #495057;
      }
      .custom-dialog-btn-secondary:hover {
        background-color: #e9ecef;
      }
      .custom-dialog-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #ced4da;
        border-radius: 6px;
        font-size: 15px;
        margin-bottom: 20px;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.2s;
        font-family: inherit;
      }
      .custom-dialog-input:focus {
        border-color: #007bff;
        box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.15);
      }
    `;
    document.head.appendChild(style);
  }

  createDialog(message, type, resolve, options = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-dialog-overlay';

    const box = document.createElement('div');
    box.className = 'custom-dialog-box';

    const msgElement = document.createElement('div');
    msgElement.className = 'custom-dialog-message';
    msgElement.textContent = message;

    const btnContainer = document.createElement('div');
    btnContainer.className = 'custom-dialog-buttons';

    let inputElement = null;

    const closeDialog = (result) => {
      overlay.classList.remove('show');
      setTimeout(() => {
        if (overlay.parentNode) {
          document.body.removeChild(overlay);
        }
        resolve(result);
      }, 200);
    };

    if (type === 'alert') {
      const okBtn = document.createElement('button');
      okBtn.className = 'custom-dialog-btn custom-dialog-btn-primary';
      okBtn.textContent = 'OK';
      okBtn.onclick = () => closeDialog(true);
      btnContainer.appendChild(okBtn);
      setTimeout(() => okBtn.focus(), 100);

    } else if (type === 'confirm') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'custom-dialog-btn custom-dialog-btn-secondary';
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.onclick = () => closeDialog(false);

      const okBtn = document.createElement('button');
      okBtn.className = 'custom-dialog-btn custom-dialog-btn-primary';
      okBtn.textContent = 'OK';
      okBtn.onclick = () => closeDialog(true);

      btnContainer.appendChild(cancelBtn);
      btnContainer.appendChild(okBtn);
      setTimeout(() => okBtn.focus(), 100);

    } else if (type === 'prompt') {
      inputElement = document.createElement('input');
      inputElement.className = 'custom-dialog-input';
      inputElement.type = options.isPassword ? 'password' : 'text';
      inputElement.placeholder = options.placeholder || '';
      if (options.defaultValue) inputElement.value = options.defaultValue;

      inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          closeDialog(inputElement.value);
        } else if (e.key === 'Escape') {
          closeDialog(null);
        }
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'custom-dialog-btn custom-dialog-btn-secondary';
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.onclick = () => closeDialog(null);

      const okBtn = document.createElement('button');
      okBtn.className = 'custom-dialog-btn custom-dialog-btn-primary';
      okBtn.textContent = 'OK';
      okBtn.onclick = () => closeDialog(inputElement.value);

      btnContainer.appendChild(cancelBtn);
      btnContainer.appendChild(okBtn);
      setTimeout(() => inputElement.focus(), 100);
    }

    box.appendChild(msgElement);
    if (inputElement) box.appendChild(inputElement);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // 強制リフローしてアニメーションを効かせる
    void overlay.offsetWidth;
    overlay.classList.add('show');
  }

  alert(message) {
    return new Promise(resolve => {
      this.createDialog(message, 'alert', resolve);
    });
  }

  confirm(message) {
    return new Promise(resolve => {
      this.createDialog(message, 'confirm', resolve);
    });
  }

  /**
   * プロンプトダイアログ（入力欄付き）
   * @param {string} message - メッセージ
   * @param {Object} options - { placeholder, defaultValue, isPassword }
   * @returns {Promise<string|null>} 入力値またはnull（キャンセル時）
   */
  prompt(message, options = {}) {
    return new Promise(resolve => {
      this.createDialog(message, 'prompt', resolve, options);
    });
  }
}

// グローバルスコープにインスタンスを登録
window.CustomDialog = new CustomDialogManager();
