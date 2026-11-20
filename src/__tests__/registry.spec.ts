import { PromiseDelegate } from '@lumino/coreutils';
import { WebMCPRegistry } from '../registry';
import { FakeModelContext, tool } from './utils';

/**
 * Count the emissions of the `changed` signal.
 */
function track(registry: WebMCPRegistry): { count: number } {
  const counter = { count: 0 };
  registry.changed.connect(sender => {
    expect(sender).toBe(registry);
    counter.count++;
  });
  return counter;
}

describe('WebMCPRegistry', () => {
  describe('#isAvailable', () => {
    it('is false without a model context', async () => {
      const registry = new WebMCPRegistry(null);
      expect(registry.isAvailable).toBe(false);
      expect(registry.toolNames).toEqual([]);
      await expect(registry.registerTool(tool('a'))).rejects.toThrow(
        /not available/
      );
    });

    it('is true with a model context', () => {
      expect(new WebMCPRegistry(new FakeModelContext()).isAvailable).toBe(true);
    });
  });

  describe('#isPolyfilled', () => {
    it('is false by default', () => {
      expect(new WebMCPRegistry(new FakeModelContext()).isPolyfilled).toBe(
        false
      );
    });

    it('is true when a polyfill provides the model context', () => {
      const registry = new WebMCPRegistry(new FakeModelContext(), true);
      expect(registry.isAvailable).toBe(true);
      expect(registry.isPolyfilled).toBe(true);
    });

    it('is false without a model context', () => {
      expect(new WebMCPRegistry(null, true).isPolyfilled).toBe(false);
    });
  });

  describe('#registerTool()', () => {
    it('registers tools with the model context', async () => {
      const context = new FakeModelContext();
      const registry = new WebMCPRegistry(context);
      const changed = track(registry);
      await registry.registerTool(tool('b'));
      await registry.registerTool(tool('a'));
      expect(registry.toolNames).toEqual(['a', 'b']);
      expect(Array.from(context.tools.keys()).sort()).toEqual(['a', 'b']);
      expect(context.signals.get('a')).toBeInstanceOf(AbortSignal);
      expect(changed.count).toBe(2);
    });

    it('removes the tool when the result is disposed', async () => {
      const context = new FakeModelContext();
      const registry = new WebMCPRegistry(context);
      const changed = track(registry);
      const registration = await registry.registerTool(tool('a'));
      await registry.registerTool(tool('b'));
      registration.dispose();
      expect(registration.isDisposed).toBe(true);
      expect(context.signals.get('a')!.aborted).toBe(true);
      expect(context.tools.has('a')).toBe(false);
      expect(registry.toolNames).toEqual(['b']);
      expect(changed.count).toBe(3);
      registration.dispose();
      expect(changed.count).toBe(3);

      // The name is free again.
      await registry.registerTool(tool('a'));
      expect(registry.toolNames).toEqual(['a', 'b']);
    });

    it('refuses a name that is already registered', async () => {
      const context = new FakeModelContext();
      const registry = new WebMCPRegistry(context);
      await registry.registerTool(tool('a'));
      await expect(registry.registerTool(tool('a'))).rejects.toThrow(
        'A WebMCP tool named "a" is already registered.'
      );
      expect(context.registered).toEqual(['a']);
    });

    it('refuses a name that is being registered', async () => {
      const context = new FakeModelContext();
      const gate = new PromiseDelegate<void>();
      context.gate = gate.promise;
      const registry = new WebMCPRegistry(context);
      const changed = track(registry);
      const first = registry.registerTool(tool('a'));
      await expect(registry.registerTool(tool('a'))).rejects.toThrow(
        /already registered/
      );
      expect(registry.toolNames).toEqual([]);
      gate.resolve();
      await first;
      expect(registry.toolNames).toEqual(['a']);
      expect(context.registered).toEqual(['a']);
      expect(changed.count).toBe(1);
    });

    it('registers different names concurrently', async () => {
      const registry = new WebMCPRegistry(new FakeModelContext());
      await Promise.all([
        registry.registerTool(tool('a')),
        registry.registerTool(tool('b'))
      ]);
      expect(registry.toolNames).toEqual(['a', 'b']);
    });

    it('rejects with the errors of the model context', async () => {
      const context = new FakeModelContext();
      context.error = new TypeError('Invalid tool name');
      const registry = new WebMCPRegistry(context);
      const changed = track(registry);
      await expect(registry.registerTool(tool('a'))).rejects.toThrow(
        'Invalid tool name'
      );
      expect(changed.count).toBe(0);

      // The name is free again.
      context.error = null;
      await registry.registerTool(tool('a'));
      expect(registry.toolNames).toEqual(['a']);
    });

    it('rejects when the model context throws synchronously', async () => {
      const context = new FakeModelContext();
      context.registerTool = () => {
        throw new Error('Not allowed');
      };
      const registry = new WebMCPRegistry(context);
      await expect(registry.registerTool(tool('a'))).rejects.toThrow(
        'Not allowed'
      );
      expect(registry.toolNames).toEqual([]);
    });

    it('rejects when the page already has a tool with that name', async () => {
      const context = new FakeModelContext();
      await context.registerTool(tool('a'));
      const registry = new WebMCPRegistry(context);
      await expect(registry.registerTool(tool('a'))).rejects.toThrow(
        /Duplicate/
      );
      expect(registry.toolNames).toEqual([]);
    });
  });
});
