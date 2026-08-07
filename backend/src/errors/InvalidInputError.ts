export class InvalidInputError extends Error {
  public statusCode: number = 400;
  public readonly code?: string;

  constructor(message: string = 'Invalid input provided.', code?: string) {
    super(message);
    this.name = 'InvalidInputError';
    this.code = code;
    Object.setPrototypeOf(this, InvalidInputError.prototype);
  }
}
