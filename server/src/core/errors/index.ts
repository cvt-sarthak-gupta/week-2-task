export class CustomError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
  json() {
    return { status: 'error', message: this.message };
  }
}

export class NotFoundError extends CustomError {
  constructor(msg = 'Not found') { super(404, msg); }
}

export class UnauthorizedError extends CustomError {
  constructor(msg = 'Unauthorized') { super(401, msg); }
}

export class ForbiddenError extends CustomError {
  constructor(msg = 'Forbidden') { super(403, msg); }
}

export class ConflictError extends CustomError {
  constructor(public readonly conflictData: unknown, msg = 'Conflict') { super(409, msg); }
  override json() {
    return { status: 'error', message: this.message, ...(this.conflictData as object) };
  }
}

export class ValidationError extends CustomError {
  constructor(msg: string) { super(422, msg); }
}

export class UnprocessableEntityError extends CustomError {
  constructor(msg: string) { super(422, msg); }
}
