import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useArticleAutosave } from './useArticleAutosave';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';

describe('useArticleAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces and sends a single PATCH after the delay', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { scheduleSave, status } = useArticleAutosave('http://localhost:3001', 'a1');

    scheduleSave({ title: 'Hello' }, 'token', vi.fn());
    expect(useApi).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);

    expect(useApi).toHaveBeenCalledTimes(1);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001',
      '/articles/a1',
      'token',
      expect.any(Function),
      { method: 'PATCH', body: { title: 'Hello' } },
    );
    expect(status.value).toBe('saved');
  });

  it('merges patches from multiple calls within the debounce window instead of dropping earlier fields', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { scheduleSave } = useArticleAutosave('http://localhost:3001', 'a1');

    scheduleSave({ title: 'Hello' }, 'token', vi.fn());
    vi.advanceTimersByTime(500);
    scheduleSave({ content: { type: 'doc' } }, 'token', vi.fn());

    await vi.advanceTimersByTimeAsync(2000);

    expect(useApi).toHaveBeenCalledTimes(1);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001',
      '/articles/a1',
      'token',
      expect.any(Function),
      { method: 'PATCH', body: { title: 'Hello', content: { type: 'doc' } } },
    );
  });

  it('sets status to error when the PATCH fails', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
    const { scheduleSave, status } = useArticleAutosave('http://localhost:3001', 'a1');

    scheduleSave({ title: 'Hello' }, 'token', vi.fn());
    await vi.advanceTimersByTimeAsync(2000);

    expect(status.value).toBe('error');
  });
});
