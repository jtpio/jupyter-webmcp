import { getModelContext } from '../modelcontext';
import { installPolyfill } from '../polyfill';

/**
 * Set `isSecureContext`, which jsdom does not have.
 */
function setSecureContext(value: boolean): void {
  Object.defineProperty(globalThis, 'isSecureContext', {
    value,
    configurable: true
  });
}

describe('installPolyfill()', () => {
  afterEach(() => {
    delete (Document.prototype as any).modelContext;
    delete (document as any).modelContext;
    delete (globalThis as any).isSecureContext;
  });

  it('installs the polyfill in a secure context', async () => {
    setSecureContext(true);
    expect(getModelContext()).toBeNull();
    expect(await installPolyfill()).toBe(true);
    const context = getModelContext();
    expect(typeof context?.registerTool).toBe('function');
    expect(String(context)).toBe('[object ModelContext]');
  });

  it('does nothing outside a secure context', async () => {
    setSecureContext(false);
    expect(await installPolyfill()).toBe(false);
    expect(getModelContext()).toBeNull();
  });

  it('keeps the model context of the browser', async () => {
    setSecureContext(true);
    const native = { registerTool: jest.fn() };
    Object.defineProperty(document, 'modelContext', {
      value: native,
      configurable: true
    });
    expect(await installPolyfill()).toBe(false);
    expect(getModelContext()).toBe(native);
  });

  it('reports a polyfill that cannot be installed', async () => {
    setSecureContext(true);
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const isExtensible = jest
      .spyOn(Object, 'isExtensible')
      .mockReturnValue(false);
    try {
      expect(await installPolyfill()).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        '[jupyter-webmcp] The WebMCP polyfill could not be installed:',
        expect.any(TypeError)
      );
    } finally {
      isExtensible.mockRestore();
      warn.mockRestore();
    }
    expect(getModelContext()).toBeNull();
  });
});
