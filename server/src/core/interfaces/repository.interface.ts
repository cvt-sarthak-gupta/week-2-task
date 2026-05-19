export interface QueryOptions<T> {
  page?: number;
  limit?: number;
  where?: Partial<T>;
  order?: Partial<Record<keyof T, 'ASC' | 'DESC'>>;
  search?: { fields: (keyof T)[]; term: string };
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IReadRepository<T> {
  findAll(options?: QueryOptions<T>): Promise<PaginatedResult<T>>;
  findById(id: string): Promise<T | null>;
  findOne(where: Partial<T>): Promise<T | null>;
  count(where?: Partial<T>): Promise<number>;
}

export interface IWriteRepository<T> {
  save(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface IRepository<T> extends IReadRepository<T>, IWriteRepository<T> {}
