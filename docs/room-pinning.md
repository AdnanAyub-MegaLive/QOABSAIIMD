# Admin room pins

Room Management → select room → Room pinning saves immediately (rooms.edit permission).
- NONE: normal ordering.
- COUNTRY: promoted within the room's country; a country must be assigned.
- GLOBAL: promoted in all lists, including other countries.

Global pins precede country pins. Within a priority group rooms retain popularity ordering. Pins do not bypass visibility, account status, blocking, or joining restrictions. Country pins receive no extra priority in worldwide discovery. Pin changes are audited and take effect on the next list refresh.

Discovery and own-room responses include `pinScope`. The Kotlin client must be updated because older builds sort by participant count and filter countries themselves. Deploy migration `20261115093000_room_pinning` before the backend code, regenerate Prisma Client, and release the updated Android app. Existing rooms default to NONE.
