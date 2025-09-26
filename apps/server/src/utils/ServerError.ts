export class ServerError extends Error {
  readonly statusCode: number;

  constructor(statusCode = 500, message?: string) {
    super(message);
    this.statusCode = statusCode;
  }
}
