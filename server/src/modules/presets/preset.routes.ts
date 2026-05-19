import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { InMemoryStore } from '../../infrastructure/inMemoryStore';
import type { PresetEntity } from './preset.entity';
import { randomUUID } from 'node:crypto';

const store = new InMemoryStore<PresetEntity>();

export function createPresetsRouter(): Router {
  const router = Router();

  // All preset routes require auth
  router.use(authMiddleware);

  // List presets for the current tenant (own + shared)
  router.get('/', (req: Request, res: Response) => {
    const tenantId = req.ctx.tenantId;
    const userId = req.ctx.currentUser.id;
    const all = store.getAll(tenantId);
    // Return own presets + presets shared within the same tenant
    const visible = all.filter((p) => p.userId === userId || p.isShared);
    res.status(200).json(visible);
  });

  // Create a preset
  router.post('/', (req: Request, res: Response) => {
    const tenantId = req.ctx.tenantId;
    const userId = req.ctx.currentUser.id;
    const { name, filterAst, isShared } = req.body as {
      name?: string;
      filterAst?: string;
      isShared?: boolean;
    };

    if (!name || !filterAst) {
      res.status(400).json({ status: 'error', message: 'name and filterAst are required' });
      return;
    }

    const now = Date.now();
    const preset: PresetEntity = {
      id: randomUUID(),
      tenantId,
      userId,
      name,
      filterAst,
      isShared: isShared ?? false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    store.set(tenantId, preset);
    res.status(201).json(preset);
  });

  // Update a preset (with optimistic locking — 409 on version mismatch)
  router.patch('/:id', (req: Request, res: Response) => {
    const tenantId = req.ctx.tenantId;
    const userId = req.ctx.currentUser.id;
    const { id } = req.params as { id: string };
    const existing = store.get(tenantId, id);

    if (!existing) {
      res.status(404).json({ status: 'error', message: 'Preset not found' });
      return;
    }
    // Non-owners may only edit shared presets; private presets are owner-only
    if (existing.userId !== userId && !existing.isShared) {
      res.status(403).json({ status: 'error', message: 'Forbidden' });
      return;
    }

    const { name, filterAst, isShared, version, force } = req.body as {
      name?: string;
      filterAst?: string;
      isShared?: boolean;
      version?: number;
      force?: boolean; // explicit conflict override — set by client after user resolves conflict
    };

    // Optimistic locking — detect concurrent edits unless caller explicitly forces overwrite
    if (!force && version !== undefined && version !== existing.version) {
      res.status(409).json({
        status: 'conflict',
        message: 'Preset was modified by another session',
        serverVersion: existing.version,
        serverPayload: existing,
      });
      return;
    }

    const updated: PresetEntity = {
      ...existing,
      name: name ?? existing.name,
      filterAst: filterAst ?? existing.filterAst,
      isShared: isShared ?? existing.isShared,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };

    store.set(tenantId, updated);
    res.status(200).json(updated);
  });

  // Delete a preset
  router.delete('/:id', (req: Request, res: Response) => {
    const tenantId = req.ctx.tenantId;
    const userId = req.ctx.currentUser.id;
    const { id } = req.params as { id: string };
    const existing = store.get(tenantId, id);

    if (!existing) {
      res.status(404).json({ status: 'error', message: 'Preset not found' });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ status: 'error', message: 'Forbidden' });
      return;
    }

    store.delete(tenantId, id);
    res.status(204).send();
  });

  return router;
}
