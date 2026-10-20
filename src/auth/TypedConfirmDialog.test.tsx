import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installDialogPolyfill } from '../__fixtures__/dialogPolyfill';
import { TypedConfirmDialog } from './TypedConfirmDialog';

beforeAll(installDialogPolyfill);

interface Overrides {
  busy?: boolean;
  error?: string | null;
}

function setup({ busy = false, error = null }: Overrides = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <TypedConfirmDialog
      title="Delete thing?"
      description={<p>It is gone for good.</p>}
      phrase="alex@example.com"
      confirmLabel="Delete thing"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { user: userEvent.setup(), onConfirm, onCancel, view };
}

describe('TypedConfirmDialog', () => {
  it('opens as a labelled modal dialog with the input focused', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Delete thing?' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('It is gone for good.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Type\s+alex@example.com\s+to confirm/)).toHaveFocus();
  });

  it('keeps the confirm button locked until the phrase is typed (case-insensitive, trimmed)', async () => {
    const { user, onConfirm } = setup();
    const confirm = screen.getByRole('button', { name: 'Delete thing' });
    expect(confirm).toBeDisabled();
    const input = screen.getByRole('textbox');
    await user.type(input, 'alex@example.co');
    expect(confirm).toBeDisabled();
    await user.type(input, 'm ');
    expect(confirm).toBeEnabled();
    await user.clear(input);
    await user.type(input, 'ALEX@EXAMPLE.COM');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('confirms with Enter once the phrase matches', async () => {
    const { user, onConfirm } = setup();
    await user.type(screen.getByRole('textbox'), 'alex@example.com{Enter}');
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('does not confirm with Enter while the phrase is wrong', async () => {
    const { user, onConfirm } = setup();
    await user.type(screen.getByRole('textbox'), 'nope{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels with the button and with Escape (native cancel event)', async () => {
    const { user, onCancel } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    const cancelEvent = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog'), cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('cannot be cancelled while busy', () => {
    const { onCancel } = setup({ busy: true });
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
  });

  it('announces an error and ties it to the input', () => {
    setup({ error: 'Nope.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Nope.');
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Nope.');
  });

  it('closes the native dialog when unmounted', () => {
    const { view } = setup();
    const dialog = screen.getByRole('dialog');
    view.unmount();
    expect(dialog).not.toHaveAttribute('open');
  });
});
