import type { Request, Response } from 'express';
import { BaseController } from '../../core/base/base.controller';
import type { PatientService } from './patient.service';
import type { EventBroadcaster } from '../../ws';

export class PatientController extends BaseController {
  constructor(
    private readonly service: PatientService,
    private readonly broadcaster: EventBroadcaster,
  ) {
    super();
  }

  async index(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(String(req.query['page'] ?? '1'), 10);
      const limit = parseInt(String(req.query['limit'] ?? '20'), 10);
      const since = req.query['since'] ? parseInt(String(req.query['since']), 10) : null;

      if (since !== null) {
        const patients = await this.service.findSince(since);
        res.status(200).json(patients);
        return;
      }

      const filterDto: import('./patient.service').PatientFilterDto = {};
      if (req.query['status'])    filterDto.status    = String(req.query['status']);
      if (req.query['ward'])      filterDto.ward      = String(req.query['ward']);
      if (req.query['search'])    filterDto.search    = String(req.query['search']);
      if (req.query['sort'])      filterDto.sort      = String(req.query['sort']);
      if (req.query['filterAst']) filterDto.filterAst = String(req.query['filterAst']);
      const result = await this.service.findAll(page, limit, filterDto);
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
      const filterDto: import('./patient.service').PatientFilterDto = {};
      if (req.query['status'])    filterDto.status    = String(req.query['status']);
      if (req.query['ward'])      filterDto.ward      = String(req.query['ward']);
      if (req.query['search'])    filterDto.search    = String(req.query['search']);
      if (req.query['sort'])      filterDto.sort      = String(req.query['sort']);
      if (req.query['filterAst']) filterDto.filterAst = String(req.query['filterAst']);
      const patients = await this.service.exportAll(filterDto);
      res.status(200).json(patients);
    } catch (e) { this.handleError(e, res); }
  }

  async stream(_req: Request, res: Response): Promise<void> {
    try {
      const patients = await this.service.findAllForStream();
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
      if (body.status !== undefined) dto.status = body.status as import('./patient.entity').PatientStatus;
      if (body.notes   !== undefined) dto.notes = body.notes;
      if (body.heartRate !== undefined) dto.heartRate = body.heartRate;
      if (body.bp        !== undefined) dto.bp = body.bp;
      if (body.temp      !== undefined) dto.temp = body.temp;
      if (body.o2sat     !== undefined) dto.o2sat = body.o2sat;
      const patient = await this.service.update(id, dto, body.version);

      // Broadcast update event
      this.broadcaster.broadcast({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'patient_updated',
        entityId: id,
        version: patient.version,
        ts: Date.now(),
        payload: patient,
      });

      res.status(200).json(patient);
    } catch (e) { this.handleError(e, res); }
  }
}
