import type { Request, Response } from 'express';
import { BaseController } from '../../core/base/base.controller';
import type { PatientService } from './patient.service';
import type { PatientFilterDto, UpdatePatientDto, PatientListQuery, PatientUpdateBody } from './patient.types';
import type { EventBroadcaster } from '../../ws';

export class PatientController extends BaseController {
  constructor(
    private readonly service: PatientService,
    private readonly broadcaster: EventBroadcaster,
  ) {
    super();
  }

  override async index(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit, since, ...filters } = req.validatedData as unknown as PatientListQuery;

      if (since !== undefined) {
        const patients = await this.service.findSince(since);
        res.status(200).json(patients);
        return;
      }

      const result = await this.service.findAll(page, limit, filters);
      res.status(200).json(result);
    } catch (e) { this.handleError(e, res); }
  }

  override async show(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.validatedData as unknown as { id: string };
      const patient = await this.service.findById(id);
      res.status(200).json(patient);
    } catch (e) { this.handleError(e, res); }
  }

  async export(req: Request, res: Response): Promise<void> {
    try {
      const filters = req.validatedData as unknown as PatientFilterDto;
      const patients = await this.service.exportAll(filters);
      res.status(200).json(patients);
    } catch (e) { this.handleError(e, res); }
  }

  async stream(req: Request, res: Response): Promise<void> {
    try {
      const { since } = req.validatedData as unknown as { since?: number };
      const patients = since !== undefined
        ? await this.service.findSince(since)
        : await this.service.findAllForStream();

      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      for (const patient of patients) {
        res.write(JSON.stringify(patient) + '\n');
      }
      res.end();
    } catch (e) { this.handleError(e, res); }
  }

  override async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.validatedData as unknown as { id: string };
      const body = req.validatedData as unknown as PatientUpdateBody;

      const dto: UpdatePatientDto = {};
      if (body.status    !== undefined) dto.status    = body.status;
      if (body.notes     !== undefined) dto.notes     = body.notes;
      if (body.heartRate !== undefined) dto.heartRate = body.heartRate;
      if (body.bp        !== undefined) dto.bp        = body.bp;
      if (body.temp      !== undefined) dto.temp      = body.temp;
      if (body.o2sat     !== undefined) dto.o2sat     = body.o2sat;

      const patient = await this.service.update(id, dto, body.version);

      this.broadcaster.broadcast({
        id: crypto.randomUUID(),
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
