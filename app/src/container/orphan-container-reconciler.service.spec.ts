import { describe, expect, it, vi } from 'vitest';
import { OrphanContainerReconciler } from './orphan-container-reconciler.service.js';

const EXEC = '11111111-1111-4111-8111-111111111111';
const config = (value?: string) => ({ get: () => value }) as never;

function docker(containers: { Id: string; Names: string[] }[], removeImpl: (id: string) => Promise<void> = async () => undefined) {
  const remove = vi.fn(removeImpl);
  return {
    client: {
      listContainers: vi.fn().mockResolvedValue(containers),
      getContainer: (id: string) => ({ remove: (opts: unknown) => remove(id).then(() => opts) }),
    },
    remove,
  };
}

describe('OrphanContainerReconciler', () => {
  it('elimina solo los contenedores sandbox-<uuid>-*, tanto en curso como detenidos', async () => {
    const { client, remove } = docker([
      { Id: 'aaa111', Names: [`/sandbox-${EXEC}-install`] },
      { Id: 'bbb222', Names: [`/sandbox-${EXEC}-test`] },
      { Id: 'ccc333', Names: ['/postgres-local'] },
      { Id: 'ddd444', Names: ['/sandbox-otra-cosa'] },
    ]);
    const removed = await new OrphanContainerReconciler(client as never, config()).reconcile();
    expect(removed).toBe(2);
    expect(remove.mock.calls.map(([id]) => id)).toEqual(['aaa111', 'bbb222']);
  });

  it('un fallo al eliminar uno no impide eliminar el resto', async () => {
    const { client, remove } = docker(
      [{ Id: 'aaa111', Names: [`/sandbox-${EXEC}-install`] }, { Id: 'bbb222', Names: [`/sandbox-${EXEC}-test`] }],
      async (id) => { if (id === 'aaa111') throw new Error('busy'); },
    );
    expect(await new OrphanContainerReconciler(client as never, config()).reconcile()).toBe(1);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('si Docker no responde no lanza y devuelve 0', async () => {
    const client = { listContainers: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    await expect(new OrphanContainerReconciler(client as never, config()).reconcile()).resolves.toBe(0);
  });

  it('SANDBOX_RECONCILE_ORPHANS_ON_START=false desactiva la reconciliación de arranque', () => {
    const { client } = docker([]);
    new OrphanContainerReconciler(client as never, config('false')).onModuleInit();
    expect(client.listContainers).not.toHaveBeenCalled();
  });
});
