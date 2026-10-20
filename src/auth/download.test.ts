import { downloadBlob } from './download';

describe('downloadBlob', () => {
  it('clicks a temporary download link and cleans up', () => {
    const create = vi.fn(() => 'blob:fake');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      expect(this.download).toBe('export.json');
      expect(this.getAttribute('href')).toBe('blob:fake');
    });
    const blob = new Blob(['{}'], { type: 'application/json' });

    downloadBlob(blob, 'export.json');

    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
