import '@testing-library/jest-dom/vitest';

if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    function showModal(this: HTMLDialogElement) {
      this.open = true;
    };

  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    function close(this: HTMLDialogElement) {
      this.open = false;
    };
}
