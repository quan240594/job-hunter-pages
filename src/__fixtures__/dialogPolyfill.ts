/** jsdom has no <dialog> methods; this gives the native element showModal()/close() for tests that open dialogs. */
export function installDialogPolyfill(): void {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}
