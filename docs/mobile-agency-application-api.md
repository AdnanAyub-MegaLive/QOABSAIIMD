# Mobile agency application API

## Submit an application

```http
POST /api/agencies/apply
Authorization: Bearer <sessionToken>
Content-Type: multipart/form-data
```

Multipart fields:

- `agencyName`: required text, maximum 120 characters
- `email`: required only when the authenticated account has no email
- `whatsapp`: required text, maximum 40 characters
- `bdCode`: required text, maximum 50 characters
- `cnicFront`: required JPEG or PNG, maximum 5 MB
- `cnicBack`: required JPEG or PNG, maximum 5 MB

The backend derives the user ID, country and existing account email from the
Bearer session. Client-supplied user or country values are not accepted.

Success:

```json
{
  "success": true,
  "data": {
    "applicationId": "AGA-A1B2C3D4E5F6",
    "status": "PENDING"
  }
}
```

A user can have only one pending application. A rejected application does not
prevent a later application.

Error codes:

- `INVALID_SESSION` (`401`)
- `ALREADY_APPLIED` (`409`)
- `VALIDATION` (`422`)
- `FILE_TOO_LARGE` (`413`)
- `SUBMISSION_FAILED` (`500`)

## Check the authenticated user's application

```http
GET /api/agencies/my-application
Authorization: Bearer <sessionToken>
```

The endpoint returns the authenticated user's most recently submitted
application:

```json
{
  "success": true,
  "data": {
    "application": {
      "applicationId": "AGA-A1B2C3D4E5F6",
      "status": "PENDING",
      "agencyName": "Starlight Network",
      "createdAt": "2026-07-20T10:00:00.000Z"
    }
  }
}
```

It returns `{ "application": null }` when the user has never applied or their
latest application was rejected, allowing the app to show a fresh application
form. Pending and approved applications are returned. Responses are never
cached.
