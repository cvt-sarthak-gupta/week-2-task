import { getDb, type DbClient } from './client';
import { PatientRepository } from './repositories/PatientRepository';
import { QueueRepository } from './repositories/QueueRepository';

interface OfflineRepos {
  db: DbClient;
  patientRepo: PatientRepository;
  queueRepo: QueueRepository;
}

let repos: OfflineRepos | null = null;

export async function getOfflineRepos(): Promise<OfflineRepos> {
  if (repos) return repos;
  const db = await getDb();
  repos = { db, patientRepo: new PatientRepository(db), queueRepo: new QueueRepository(db) };
  return repos;
}

export function resetOfflineRepos(): void {
  repos = null;
}
