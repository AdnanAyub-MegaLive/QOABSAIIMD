export class EventModuleError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = "EventModuleError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function validationError(error) {
  if (!error?.validation) return error;
  return new EventModuleError(
    "VALIDATION_ERROR",
    "One or more fields are invalid.",
    422,
    error.validation,
  );
}

export function eventJson(body, status = 200, headers) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...headers,
    },
  });
}

export function eventErrorResponse(error) {
  if (error instanceof EventModuleError)
    return eventJson(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      error.status,
    );
  console.error("Events module request failed", error);
  return eventJson(
    {
      success: false,
      error: {
        code: "EVENTS_INTERNAL_ERROR",
        message: "Unable to complete this Events request.",
      },
    },
    500,
  );
}
