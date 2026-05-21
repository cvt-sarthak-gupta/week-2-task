import type { Request, Response } from 'express';
import { BaseController } from '../../core/base/base.controller';
import type { PatientService, PatientFilterDto } from './patient.service';
import type { EventBroadcaster } from '../../ws';

export class PatientController extends BaseController {
  constructor(
    private readonly service: PatientService,
    private readonly broadcaster: EventBroadcaster,
  ) {
    super();
  }

  private buildFilterDto(query: Request['query']): PatientFilterDto {
    const dto: PatientFilterDto = {};
    if (query['status'])    dto.status    = String(query['status']);
    if (query['ward'])      dto.ward      = String(query['ward']);
    if (query['search'])    dto.search    = String(query['search']);
    if (query['sort'])      dto.sort      = String(query['sort']);
    if (query['filterAst']) dto.filterAst = String(query['filterAst']);
    return dto;
  }

  async index(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(String(req.query['page'] ?? '1'), 10);
      const limit = Math.min(parseInt(String(req.query['limit'] ?? '20'), 10), 200);

      if (req.query['since']) {
        const since = parseInt(String(req.query['since']), 10);
        if (isNaN(since)) { res.status(400).json({ status: 'error', message: 'since must be a number' }); return; }
        const patients = await this.service.findSince(since);
        res.status(200).json(patients);
        return;
      }

      const result = await this.service.findAll(page, limit, this.buildFilterDto(req.query));
      res.status(200).json(result);
    } catch (e) { this.handleError(e, res); }
  }

  async show(req: Request, res: Response): Promise<void> {
    try {
      const patient = await this.service.findById(req.params['id'] ?? '');
      res.status(200).json(patient);
    } catch (e) { this.handleError(e, res); }
  }

  async export(req: Request, res: Response): Promise<void> {
    try {
      const patients = await this.service.exportAll(this.buildFilterDto(req.query));
      res.status(200).json(patients);
    } catch (e) { this.handleError(e, res); }
  }

  async stream(req: Request, res: Response): Promise<void> {
    try {
      let patients;
      if (req.query['since'] !== undefined) {
        const since = parseInt(String(req.query['since']), 10);
        if (isNaN(since)) { res.status(400).json({ status: 'error', message: 'since must be a number' }); return; }
        patients = await this.service.findSince(since);
      } else {
        patients = await this.service.findAllForStream();
      }
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      for (const patient of patients) {
        res.write(JSON.stringify(patient) + '\n');
      }
      res.end();
    } catch (e) { this.handleError(e, res); }
  }

  async patch(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params['id'] ?? '';
      const body = req.body as { status?: string; notes?: string; version?: number; heartRate?: number; bp?: string; temp?: number; o2sat?: number };
      const dto: import('./patient.service').UpdatePatientDto = {};
      if (body.status    !== undefined) dto.status    = body.status as import('./patient.entity').PatientStatus;
      if (body.notes     !== undefined) dto.notes     = body.notes;
      if (body.heartRate !== undefined) dto.heartRate = body.heartRate;
      if (body.bp        !== undefined) dto.bp        = body.bp;
      if (body.temp      !== undefined) dto.temp      = body.temp;
      if (body.o2sat     !== undefined) dto.o2sat     = body.o2sat;

      const patient = await this.service.update(id, dto, body.version);

      this.broadcaster.broadcast({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'patient_updated',
        entityId: id,
        tenantId: req.ctx.tenantId,
        version: patient.version,
        ts: Date.now(),
        payload: patient,
      });

      res.status(200).json(patient);
    } catch (e) { this.handleError(e, res); }
  }
}
