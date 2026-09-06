export class SameOriginError extends Error {
  readonly status = 403;

  constructor() {
    super("Request origin is not allowed");
  }
}

export function requireSameOrigin(request: Request, expectedOrigin?: string) {
  const origin = request.headers.get("origin");
  const contentType = request.headers.get("content-type") ?? "";
  let allowedOrigin: string;

  try {
    allowedOrigin = expectedOrigin ? new URL(expectedOrigin).origin : new URL(request.url).origin;
  } catch {
    throw new SameOriginError();
  }

  if (
    !origin ||
    origin !== allowedOrigin ||
    !contentType.toLowerCase().startsWith("application/json")
  ) {
    throw new SameOriginError();
  }
}
