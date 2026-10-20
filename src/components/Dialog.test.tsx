import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './Dialog';

function Harness({ withFooter = true, wide = false }: Readonly<{ withFooter?: boolean; wide?: boolean }>) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Dialog
          title="Outer"
          onClose={() => setOpen(false)}
          wide={wide}
          footer={withFooter ? <button type="button">Footer action</button> : undefined}
        >
          <input aria-label="First field" data-autofocus />
          <button type="button" onClick={() => setInner(true)}>
            Open inner
          </button>
        </Dialog>
      ) : null}
      {inner ? (
        <Dialog title="Inner" onClose={() => setInner(false)}>
          <p>Inner body</p>
        </Dialog>
      ) : null}
    </div>
  );
}

describe('Dialog', () => {
  it('is a labelled modal that focuses the autofocus field and locks page scroll', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Outer' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('First field')).toHaveFocus();
    expect(document.body).toHaveClass('modal-open');
    expect(dialog).toHaveClass('dialog');
    expect(dialog).not.toHaveClass('dialog-wide');
  });

  it('can be wide and works without a footer', async () => {
    const user = userEvent.setup();
    render(<Harness withFooter={false} wide />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Outer' })).toHaveClass('dialog-wide');
    expect(screen.queryByRole('button', { name: 'Footer action' })).not.toBeInTheDocument();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const close = screen.getByRole('button', { name: 'Close dialog' });
    const footer = screen.getByRole('button', { name: 'Footer action' });
    footer.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(footer).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Open inner' })).toHaveFocus();
  });

  it('pulls focus in when it is on the dialog panel itself', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Outer' });
    dialog.focus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Footer action' })).toHaveFocus();
    dialog.focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body).not.toHaveClass('modal-open');
  });

  it('closes with the close button and with a click on the backdrop, but not on the panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Outer' }));
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Outer' }).parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('only reacts in the top-most dialog and keeps the scroll lock until all are closed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Open inner' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'Outer' }).parentElement as HTMLElement);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(document.body).toHaveClass('modal-open');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores other keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.keyboard('a');
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
  });
});

describe('Dialog without an autofocus target', () => {
  it('focuses the panel', async () => {
    render(
      <Dialog title="Plain" onClose={() => undefined}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Plain' })).toHaveFocus();
  });
});

describe('ConfirmDialog', () => {
  it('asks, focuses Cancel and confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="Delete it?" message="Really delete?" confirmLabel="Delete" busy={false} error={null} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    expect(screen.getByRole('dialog', { name: 'Delete it?' })).toBeInTheDocument();
    expect(screen.getByText('Really delete?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows an error and disables confirm while busy', () => {
    render(
      <ConfirmDialog title="Delete it?" message="Really?" confirmLabel="Delete" busy error="Network down" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});
