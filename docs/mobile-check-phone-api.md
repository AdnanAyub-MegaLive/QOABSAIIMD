# Mobile phone registration check

```http
GET /api/users/check-phone?phone=<value>
```

This endpoint is public and does not require an Authorization header. It
normalizes phone numbers by trimming and removing spaces, parentheses, dots
and hyphens before performing one database lookup.

Success:

```json
{
  "success": true,
  "data": {
    "exists": true
  }
}
```

Missing phone:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "phone is required."
  }
}
```

The endpoint permits 10 requests per source IP during a rolling 60-second
window. Further requests return HTTP `429` with the `RATE_LIMITED` code.
Responses use `Cache-Control: no-store, max-age=0`.
